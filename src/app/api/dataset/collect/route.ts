import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface DatasetJob {
  id: string;
  status: 'running' | 'complete' | 'error';
  stage: 'validating' | 'resolving' | 'downloading' | 'decrypting' | 'rendering' | 'merging' | 'complete' | 'error';
  message: string;
  current: number;
  total: number;
  logs: string[];
  record?: any;
  error?: string;
  startedAt: string;
  updatedAt: string;
  listeners: Set<(job: DatasetJob) => void>;
}

// In-memory jobs map with TTL
const jobs = new Map<string, DatasetJob>();

function nowIso(): string {
  return new Date().toISOString();
}

function getOrCreateJob(id: string): DatasetJob {
  let job = jobs.get(id);
  if (!job) {
    job = {
      id,
      status: 'running',
      stage: 'validating',
      message: 'Initializing collection job...',
      current: 0,
      total: 0,
      logs: ['Job created'],
      startedAt: nowIso(),
      updatedAt: nowIso(),
      listeners: new Set(),
    };
    jobs.set(id, job);
  }
  return job;
}

function updateJob(
  job: DatasetJob,
  patch: Partial<Pick<DatasetJob, 'status' | 'stage' | 'message' | 'current' | 'total' | 'record' | 'error'>>,
  appendLog?: string
) {
  Object.assign(job, patch);
  job.updatedAt = nowIso();
  if (appendLog) {
    job.logs.push(appendLog);
    if (job.logs.length > 80) job.logs.shift();
  }
  // Notify any active SSE listeners
  job.listeners.forEach((listener) => {
    try {
      listener(job);
    } catch {}
  });
}

function runPythonCollector(
  jobId: string,
  params: { date: string; language: string; newspaper: string; edition: string }
) {
  const job = getOrCreateJob(jobId);
  const projectRoot = process.cwd();

  const pythonBin = process.env.PYTHON_PATH || 'python';
  const args = [
    '-m',
    'dataset',
    'collect',
    '--date',
    params.date,
    '--language',
    params.language,
    '--newspaper',
    params.newspaper || 'all',
    '--edition',
    params.edition || 'all',
    '--json-progress',
  ];

  updateJob(
    job,
    {
      status: 'running',
      stage: 'resolving',
      message: `Starting dataset collection for ${params.newspaper} (${params.edition})...`,
    },
    `Executing: python ${args.join(' ')}`
  );

  const child = spawn(pythonBin, args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
    },
    windowsHide: true,
  });

  let buffer = '';

  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf-8');
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('JSON_PROGRESS:')) {
        try {
          const jsonStr = trimmed.slice('JSON_PROGRESS:'.length);
          const data = JSON.parse(jsonStr);

          const stage = data.stage || 'downloading';
          const message = data.message || '';
          const current = typeof data.current === 'number' ? data.current : job.current;
          const total = typeof data.total === 'number' ? data.total : job.total;

          if (stage === 'complete') {
            updateJob(
              job,
              {
                status: 'complete',
                stage: 'complete',
                message: message || 'Dataset issue collection complete!',
                current: total || current,
                total: total || current,
                record: data.record,
              },
              `✓ ${message}`
            );
          } else if (stage === 'error') {
            updateJob(
              job,
              {
                status: 'error',
                stage: 'error',
                message: data.error || message || 'Collection failed',
                error: data.error,
              },
              `❌ ${data.error || message}`
            );
          } else {
            updateJob(
              job,
              {
                stage,
                message,
                current,
                total,
              },
              message
            );
          }
        } catch {
          // If JSON parse failed, record log
          updateJob(job, {}, trimmed);
        }
      } else {
        // Plain stdout log
        updateJob(job, {}, trimmed);
      }
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    const errText = chunk.toString('utf-8').trim();
    if (errText) {
      updateJob(job, {}, `[stderr] ${errText}`);
    }
  });

  child.on('close', (code) => {
    if (code === 0) {
      if (job.status !== 'complete' && job.status !== 'error') {
        updateJob(
          job,
          {
            status: 'complete',
            stage: 'complete',
            message: 'Collection process finished successfully',
          },
          'Process completed with exit code 0'
        );
      }
    } else {
      if (job.status !== 'complete') {
        updateJob(
          job,
          {
            status: 'error',
            stage: 'error',
            message: `Python collector exited with code ${code}`,
            error: `Process exit code ${code}`,
          },
          `Process failed with exit code ${code}`
        );
      }
    }
  });

  child.on('error', (err) => {
    updateJob(
      job,
      {
        status: 'error',
        stage: 'error',
        message: `Failed to launch Python engine: ${err.message}`,
        error: err.message,
      },
      `Spawn error: ${err.message}`
    );
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, language, newspaper, edition } = body;

    if (!date || !language) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: date, language' },
        { status: 400 }
      );
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    getOrCreateJob(jobId);

    // Run Python background task
    runPythonCollector(jobId, {
      date,
      language,
      newspaper: newspaper || 'all',
      edition: edition || 'all',
    });

    return NextResponse.json({
      success: true,
      jobId,
      message: 'Dataset collection task started',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to start collection job' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  const stream = searchParams.get('stream') === 'true' || request.headers.get('accept')?.includes('text/event-stream');

  if (!jobId) {
    return NextResponse.json(
      { success: false, error: 'Missing jobId query parameter' },
      { status: 400 }
    );
  }

  const job = jobs.get(jobId);
  if (!job) {
    return NextResponse.json(
      { success: false, error: 'Job not found' },
      { status: 404 }
    );
  }

  // Regular JSON polling
  if (!stream) {
    const { listeners, ...cleanJob } = job;
    return NextResponse.json({
      success: true,
      job: cleanJob,
    });
  }

  // Server-Sent Events (SSE) stream
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  const sendEvent = async (data: any) => {
    try {
      const { listeners, ...cleanData } = data;
      const payload = `data: ${JSON.stringify(cleanData)}\n\n`;
      await writer.write(encoder.encode(payload));
    } catch {}
  };

  // Send initial state
  await sendEvent(job);

  if (job.status === 'complete' || job.status === 'error') {
    await writer.close();
  } else {
    const listener = async (updated: DatasetJob) => {
      await sendEvent(updated);
      if (updated.status === 'complete' || updated.status === 'error') {
        job.listeners.delete(listener);
        try {
          await writer.close();
        } catch {}
      }
    };
    job.listeners.add(listener);

    request.signal.addEventListener('abort', () => {
      job.listeners.delete(listener);
      try {
        writer.close();
      } catch {}
    });
  }

  return new Response(responseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
