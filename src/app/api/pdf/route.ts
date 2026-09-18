import { NextRequest, NextResponse } from 'next/server';
import { 
  fetchLiveData, 
  joinUrl,
  decryptEntry,
  findMatchingKey,
} from '@/lib/api/tradingref';
import { fetchLiveEditionPages } from '@/lib/scraper/live-scraper';
import { validateDateString } from '@/lib/utils/sanitize';
import { IMAGE_PROXY_BASE } from '@/lib/constants';
import { env } from '@/lib/env';
import { PDFDocument } from 'pdf-lib';
import { rateLimit, RateLimitPresets } from '@/lib/rate-limit';
import { fetchWithTimeout, fetchWithRetry, externalApiCircuitBreaker } from '@/lib/fetch-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface PdfRequest {
  date: string;
  language: string;
  newspaper: string;
  edition: string;
  requestId?: string;
}

type SniffedFileType =
  | 'pdf'
  | 'jpg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'svg'
  | 'html'
  | 'json'
  | 'text'
  | 'unknown';

interface DownloadedAsset {
  data: Uint8Array;
  fileType: SniffedFileType;
}

interface GeneratedPdfResult {
  pdfData: Uint8Array | null;
  pagesAdded: number;
}

interface LockedPdfMergeResult extends GeneratedPdfResult {
  failures: string[];
}

interface ProgressSnapshot {
  status: 'running' | 'complete' | 'error';
  stage: 'validating' | 'fetching' | 'downloading' | 'decrypting' | 'merging' | 'complete' | 'error';
  message: string;
  current?: number;
  total?: number;
  logs: string[];
  startedAt: string;
  updatedAt: string;
}

interface GeneratedFileEntry {
  pdfData: Uint8Array;
  createdAt: number;
  fileName: string;
}

const PROGRESS_TTL_MS = 15 * 60 * 1000;
const progressJobs = new Map<string, ProgressSnapshot>();
const generatedFiles = new Map<string, GeneratedFileEntry>();
const PARALLEL_SOURCE_DOWNLOADS = 3;

function nowIso(): string {
  return new Date().toISOString();
}

function createProgressJob(jobId: string, message: string): void {
  const now = nowIso();
  progressJobs.set(jobId, {
    status: 'running',
    stage: 'validating',
    message,
    logs: [message],
    startedAt: now,
    updatedAt: now,
  });
}

function updateProgressJob(
  jobId: string,
  patch: Partial<Pick<ProgressSnapshot, 'status' | 'stage' | 'message' | 'current' | 'total'>>,
  appendLog?: string
): void {
  const existing = progressJobs.get(jobId);
  if (!existing) return;

  const logs = appendLog ? [...existing.logs, appendLog].slice(-60) : existing.logs;
  progressJobs.set(jobId, {
    ...existing,
    ...patch,
    logs,
    updatedAt: nowIso(),
  });
}

function pruneProgressJobs(): void {
  const now = Date.now();
  for (const [jobId, job] of progressJobs.entries()) {
    const age = now - new Date(job.updatedAt).getTime();
    if (age > PROGRESS_TTL_MS) {
      progressJobs.delete(jobId);
    }
  }
}

function pruneGeneratedFiles(): void {
  const now = Date.now();
  for (const [fileId, file] of generatedFiles.entries()) {
    if (now - file.createdAt > PROGRESS_TTL_MS) {
      generatedFiles.delete(fileId);
    }
  }
}

function buildClientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  const ip = (forwarded?.split(',')[0]?.trim() || realIp || cfConnectingIp || 'unknown').trim();
  const userAgent = (request.headers.get('user-agent') || 'unknown-ua').slice(0, 80);
  return `${ip}:${userAgent}`;
}

function startsWithBytes(data: Uint8Array, signature: number[]): boolean {
  if (data.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (data[i] !== signature[i]) return false;
  }
  return true;
}

function toAsciiPrefix(data: Uint8Array, max = 256): string {
  const prefix = data.slice(0, max);
  return new TextDecoder('utf-8', { fatal: false }).decode(prefix).trim().toLowerCase();
}

function sniffFileType(data: Uint8Array, contentType: string, sourceUrl: string): SniffedFileType {
  const ct = contentType.toLowerCase();

  if (ct.includes('application/pdf')) return 'pdf';
  if (ct.includes('image/jpeg') || ct.includes('image/jpg')) return 'jpg';
  if (ct.includes('image/png')) return 'png';
  if (ct.includes('image/webp')) return 'webp';
  if (ct.includes('image/gif')) return 'gif';
  if (ct.includes('image/svg')) return 'svg';
  if (ct.includes('application/json')) return 'json';
  if (ct.includes('text/html')) return 'html';
  if (ct.startsWith('text/')) return 'text';

  if (startsWithBytes(data, [0x25, 0x50, 0x44, 0x46])) return 'pdf';
  if (startsWithBytes(data, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWithBytes(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWithBytes(data, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (
    startsWithBytes(data, [0x52, 0x49, 0x46, 0x46]) &&
    data.length >= 12 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return 'webp';
  }

  const textPrefix = toAsciiPrefix(data);
  if (textPrefix.startsWith('<!doctype html') || textPrefix.startsWith('<html')) return 'html';
  if (textPrefix.startsWith('{') || textPrefix.startsWith('[')) return 'json';
  if (textPrefix.includes('<svg')) return 'svg';

  const path = sourceUrl.toLowerCase();
  if (path.endsWith('.pdf')) return 'pdf';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'jpg';
  if (path.endsWith('.png')) return 'png';

  return 'unknown';
}

async function downloadAsset(url: string): Promise<DownloadedAsset | null> {
  try {
    // Use circuit breaker to prevent cascading failures
    return await externalApiCircuitBreaker.execute('pdf-download', async () => {
      // Fetch with 30s timeout and retry logic
      const response = await fetchWithRetry(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/pdf,image/*,*/*',
          },
          cache: 'no-store',
          timeout: 30000, // 30 second timeout
        },
        {
          maxRetries: 2,
          retryDelay: 1000,
        }
      );
      
      if (!response.ok) return null;

      const contentType = response.headers.get('content-type') ?? '';
      const data = new Uint8Array(await response.arrayBuffer());
      if (!data.length) return null;

      return {
        data,
        fileType: sniffFileType(data, contentType, url),
      };
    });
  } catch (error) {
    console.error('Asset download failed:', error);
    return null;
  }
}

async function downloadProxyImage(url: string): Promise<DownloadedAsset | null> {
  try {
    const proxyUrl = `${IMAGE_PROXY_BASE}/?url=${encodeURIComponent(url)}&maxage=1d&output=jpg&q=80`;
    
    // Use circuit breaker and timeout for proxy requests
    return await externalApiCircuitBreaker.execute('image-proxy', async () => {
      const response = await fetchWithTimeout(proxyUrl, { timeout: 20000 });
      if (!response.ok) return null;

      const data = new Uint8Array(await response.arrayBuffer());
      if (!data.length) return null;

      return {
        data,
        fileType: 'jpg',
      };
    });
  } catch (error) {
    console.error('Proxy image download failed:', error);
    return null;
  }
}

async function addImageToPdf(pdfDoc: PDFDocument, data: Uint8Array): Promise<boolean> {
  try {
    let image;
    try {
      image = await pdfDoc.embedJpg(data);
    } catch {
      image = await pdfDoc.embedPng(data);
    }

    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
    return true;
  } catch {
    return false;
  }
}

async function addPdfToPdf(target: PDFDocument, data: Uint8Array): Promise<number> {
  try {
    let source: PDFDocument;
    try {
      source = await PDFDocument.load(data);
    } catch {
      source = await PDFDocument.load(data, { ignoreEncryption: true });
    }

    const indices = source.getPageIndices();
    if (!indices.length) return 0;
    const pages = await target.copyPages(source, indices);
    pages.forEach((page) => target.addPage(page));
    return pages.length;
  } catch {
    return 0;
  }
}

async function generatePdfFromUrls(
  urls: string[],
  onProgress?: (current: number, total: number, message: string, log: string) => void,
  onBeforeFinalize?: (pagesAdded: number, sourceTotal: number) => void
): Promise<GeneratedPdfResult> {
  const mergedPdf = await PDFDocument.create();
  let pagesAdded = 0;

  for (let chunkStart = 0; chunkStart < urls.length; chunkStart += PARALLEL_SOURCE_DOWNLOADS) {
    const chunkUrls = urls.slice(chunkStart, chunkStart + PARALLEL_SOURCE_DOWNLOADS);

    chunkUrls.forEach((_, localIndex) => {
      const sourceIndex = chunkStart + localIndex;
      onProgress?.(
        sourceIndex,
        urls.length,
        `Downloading source ${sourceIndex + 1} of ${urls.length}`,
        `Starting download: source ${sourceIndex + 1}`
      );
    });

    const assets = await Promise.all(chunkUrls.map((url) => downloadAsset(url)));

    for (let localIndex = 0; localIndex < chunkUrls.length; localIndex++) {
      const i = chunkStart + localIndex;
      const url = chunkUrls[localIndex];
      const asset = assets[localIndex];

      if (!asset) {
        onProgress?.(i + 1, urls.length, `Source ${i + 1} unavailable, moving to next`, `⚠️ Source ${i + 1} unavailable`);
        continue;
      }

      if (asset.fileType === 'pdf') {
        const pdfPages = await addPdfToPdf(mergedPdf, asset.data);
        if (pdfPages > 0) {
          pagesAdded += pdfPages;
          onProgress?.(i + 1, urls.length, `Merged PDF source ${i + 1} (${pdfPages} pages)`, `✓ Merged PDF ${i + 1}: ${pdfPages} pages`);
          continue;
        }

        const proxyAsset = await downloadProxyImage(url);
        if (proxyAsset) {
          const ok = await addImageToPdf(mergedPdf, proxyAsset.data);
          if (ok) {
            pagesAdded += 1;
            onProgress?.(i + 1, urls.length, `Recovered source ${i + 1} via image fallback`, `✓ Recovered ${i + 1} via proxy`);
          }
        }
        continue;
      }

      if (asset.fileType === 'jpg' || asset.fileType === 'png') {
        const ok = await addImageToPdf(mergedPdf, asset.data);
        if (ok) {
          pagesAdded += 1;
          onProgress?.(i + 1, urls.length, `Embedded image source ${i + 1}`, `✓ Embedded image ${i + 1}`);
        }
        continue;
      }

      const proxyAsset = await downloadProxyImage(url);
      if (!proxyAsset) {
        onProgress?.(i + 1, urls.length, `Unsupported source ${i + 1}, skipped`, `⚠️ Skipped unsupported source ${i + 1}`);
        continue;
      }

      const ok = await addImageToPdf(mergedPdf, proxyAsset.data);
      if (ok) {
        pagesAdded += 1;
        onProgress?.(i + 1, urls.length, `Converted source ${i + 1} through proxy`, `✓ Converted ${i + 1} via proxy`);
      }
    }
  }

  if (!pagesAdded) {
    return { pdfData: null, pagesAdded: 0 };
  }

  onBeforeFinalize?.(pagesAdded, urls.length);

  return {
    pdfData: await mergedPdf.save(),
    pagesAdded,
  };
}

function buildPasswordMapFromPages(pages: string[]): Record<string, string> {
  const map: Record<string, string> = {};

  for (const page of pages) {
    try {
      const fileName = (page || '').trim().split('/').pop() ?? '';
      if (!fileName) continue;
      if (!fileName.toLowerCase().endsWith('.pdf')) continue;
      if (fileName.length < 10) continue;
      map[fileName] = fileName.slice(0, 10);
    } catch {
      continue;
    }
  }

  return map;
}

async function mergeLockedPdfsWithCloudRun(
  urls: string[],
  passwords: Record<string, string>,
  onProgress?: (message: string, log: string, current?: number, total?: number) => void
): Promise<LockedPdfMergeResult> {
  if (!urls.length) {
    return { pdfData: null, pagesAdded: 0, failures: [] };
  }

  const configuredUrl = env.LOCKED_PDF_DECRYPT_URL?.trim();
  if (!configuredUrl) {
    return {
      pdfData: null,
      pagesAdded: 0,
      failures: ['LOCKED_PDF_DECRYPT_URL is not configured'],
    };
  }

  let serviceUrl = configuredUrl;
  if (!configuredUrl.endsWith('/merge-locked')) {
    serviceUrl = `${configuredUrl.replace(/\/+$/, '')}/merge-locked`;
  }

  const inputPayload = {
    urls,
    passwords,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (env.LOCKED_PDF_DECRYPT_TOKEN?.trim()) {
    headers.Authorization = `Bearer ${env.LOCKED_PDF_DECRYPT_TOKEN.trim()}`;
  }

  const simulatedTotal = Math.max(urls.length, 6);
  let simulatedCurrent = 0;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  try {

    const emitProgress = (message: string, log: string, step?: number) => {
      if (typeof step === 'number') {
        simulatedCurrent = Math.max(simulatedCurrent, Math.min(step, simulatedTotal));
      }
      onProgress?.(message, log, simulatedCurrent, simulatedTotal);
    };

    emitProgress(`Connecting to decryption service...`, `🔐 Initiating secure connection`, 1);
    heartbeat = setInterval(() => {
      if (simulatedCurrent < simulatedTotal - 1) {
        simulatedCurrent += 1;
      }
      onProgress?.(
        `Decrypting locked PDF sources (${simulatedCurrent}/${simulatedTotal})...`,
        `🔓 Decrypting source batch ${simulatedCurrent}/${simulatedTotal}`,
        simulatedCurrent,
        simulatedTotal
      );
    }, 1500);
    
    const response = await fetchWithRetry(
      serviceUrl,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(inputPayload),
        cache: 'no-store',
        // Keep this below the route timeout so we can return a controlled error
        // instead of letting the platform emit a generic 504.
        timeout: 45000,
      },
      {
        // Avoid extending total runtime with retries in serverless execution.
        maxRetries: 0,
        retryDelay: 1000,
      }
    );

    emitProgress(`Processing decryption response...`, `🔓 Decryption service responded`, simulatedTotal - 1);

    const rawText = await response.text();
    let parsed: {
      ok?: boolean;
      pagesAdded?: number;
      pdfBase64?: string;
      failures?: string[];
      error?: string;
    } = {};

    try {
      parsed = JSON.parse(rawText || '{}');
    } catch {
      return {
        pdfData: null,
        pagesAdded: 0,
        failures: [
          response.ok
            ? 'Cloud Run decrypt service returned invalid JSON'
            : `Cloud Run decrypt service error (${response.status})`,
        ],
      };
    }

    if (!response.ok || !parsed.ok || !parsed.pdfBase64) {
      return {
        pdfData: null,
        pagesAdded: 0,
        failures: parsed.failures && parsed.failures.length
          ? parsed.failures
          : [parsed.error || `Cloud Run decrypt service failed (${response.status})`],
      };
    }

    emitProgress(`Decryption completed successfully`, `✓ Decrypted ${parsed.pagesAdded || 0} pages`, simulatedTotal);

    return {
      pdfData: new Uint8Array(Buffer.from(parsed.pdfBase64, 'base64')),
      pagesAdded: parsed.pagesAdded ?? 0,
      failures: parsed.failures ?? [],
    };
  } catch (error) {
    return {
      pdfData: null,
      pagesAdded: 0,
      failures: [
        error instanceof Error
          ? `Cloud Run request failed: ${error.message}`
          : 'Cloud Run request failed',
      ],
    };
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
  }
}

export async function GET(request: NextRequest) {
  const fileId = request.nextUrl.searchParams.get('fileId');
  if (fileId) {
    const fileRateLimit = await rateLimit(request, {
      ...RateLimitPresets.standard,
      maxRequests: 60,
      keyGenerator: (req) => `${buildClientKey(req)}:pdf-file:${fileId}`,
    });
    if (!fileRateLimit.success) {
      return fileRateLimit.response;
    }

    pruneGeneratedFiles();
    const stored = generatedFiles.get(fileId);
    if (!stored) {
      return NextResponse.json(
        { success: false, error: 'Requested PDF is no longer available. Please generate again.' },
        { status: 404 }
      );
    }

    const pdfBuffer = new ArrayBuffer(stored.pdfData.byteLength);
    new Uint8Array(pdfBuffer).set(stored.pdfData);
    const pdfBody = new Blob([pdfBuffer], { type: 'application/pdf' });

    return new NextResponse(pdfBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${stored.fileName}"`,
        'Content-Length': String(stored.pdfData.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  }

  // Polling can be frequent, so key by client + job to avoid cross-user throttling.
  const jobId = request.nextUrl.searchParams.get('jobId');
  const rateLimitResult = await rateLimit(request, {
    ...RateLimitPresets.relaxed,
    maxRequests: 240,
    keyGenerator: (req) => `${buildClientKey(req)}:progress:${jobId ?? 'unknown-job'}`,
  });
  if (!rateLimitResult.success) {
    return rateLimitResult.response;
  }

  pruneProgressJobs();

  if (!jobId) {
    return NextResponse.json(
      { success: false, error: 'jobId query parameter is required' },
      { status: 400 }
    );
  }

  const progress = progressJobs.get(jobId);
  if (!progress) {
    return NextResponse.json(
      {
        success: true,
        requestId: jobId,
        progress: {
          status: 'running',
          stage: 'fetching',
          message: 'Progress is unavailable on this server instance. Waiting for final response...',
          logs: [],
          startedAt: nowIso(),
          updatedAt: nowIso(),
        },
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    success: true,
    requestId: jobId,
    progress,
  });
}

export async function POST(request: NextRequest) {
  // Resource-heavy route: keep strict, but isolate by client fingerprint to avoid NAT collisions.
  const rateLimitResult = await rateLimit(request, {
    ...RateLimitPresets.strict,
    maxRequests: 20,
    keyGenerator: (req) => `${buildClientKey(req)}:pdf-generate`,
  });
  if (!rateLimitResult.success) {
    return rateLimitResult.response;
  }

  pruneProgressJobs();
  pruneGeneratedFiles();

  let requestId = '';

  try {
    // Validate request body size (limit to 1MB)
    const contentLength = request.headers.get('content-length');
    const MAX_BODY_SIZE = 1024 * 1024; // 1MB
    
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return NextResponse.json(
        { success: false, error: 'Request body too large' },
        { status: 413 }
      );
    }

    const body: PdfRequest = await request.json();
    requestId = (typeof body.requestId === 'string' && body.requestId.trim())
      ? body.requestId.trim()
      : crypto.randomUUID();
    createProgressJob(requestId, 'Validating download request');

    const { date, language, newspaper, edition } = body;
    
    // Validate inputs
    if (!date || !language || !newspaper || !edition) {
      updateProgressJob(
        requestId,
        { status: 'error', stage: 'error', message: 'Request validation failed' },
        'Missing required parameters'
      );
      return NextResponse.json(
        { success: false, error: 'Missing required parameters', requestId },
        { status: 400 }
      );
    }
    
    // Validate date format
    if (!validateDateString(date)) {
      updateProgressJob(
        requestId,
        { status: 'error', stage: 'error', message: 'Date validation failed' },
        `Invalid date supplied: ${date}`
      );
      return NextResponse.json(
        { success: false, error: 'Invalid date format. Expected YYYYMMDD.', requestId },
        { status: 400 }
      );
    }
    
    // Validate parameter lengths and patterns to prevent injection
    if (
      typeof language !== 'string' || language.length > 50 ||
      typeof newspaper !== 'string' || newspaper.length > 100 ||
      typeof edition !== 'string' || edition.length > 100
    ) {
      updateProgressJob(
        requestId,
        { status: 'error', stage: 'error', message: 'Parameter validation failed' },
        'Invalid parameter format or length'
      );
      return NextResponse.json(
        { success: false, error: 'Invalid request parameters', requestId },
        { status: 400 }
      );
    }

    updateProgressJob(
      requestId,
      { stage: 'fetching', message: 'Fetching live edition data' },
      `Loading TradingRef dataset for ${date}`
    );
    
    // Fetch live data from TradingRef
    const liveData = await fetchLiveData(date);
    
    if (liveData) {
      const originalLangKey = findMatchingKey(Object.keys(liveData), language);
      
      if (originalLangKey && liveData[originalLangKey]) {
        const originalPaperKey = findMatchingKey(
          Object.keys(liveData[originalLangKey]),
          newspaper
        );
        
        if (originalPaperKey && liveData[originalLangKey][originalPaperKey]) {
          const originalEditionKey = findMatchingKey(
            Object.keys(liveData[originalLangKey][originalPaperKey]),
            edition
          );
          
          if (originalEditionKey) {
            const obfuscated = liveData[originalLangKey][originalPaperKey][originalEditionKey];
            let entry = typeof obfuscated === 'string' && obfuscated.trim().length > 0 ? decryptEntry(obfuscated) : null;
            
            if (!entry || entry.pages.length === 0) {
              updateProgressJob(
                requestId,
                { stage: 'fetching', message: 'Resolving edition pages dynamically from TradingRef...' },
                'Scraping live edition pages'
              );
              entry = await fetchLiveEditionPages(date, originalLangKey, originalPaperKey, originalEditionKey);
            }

            if (entry && entry.pages.length > 0) {
              const urls = entry.pages.map(page => joinUrl(entry.prefix, page));
              const passwordMap = buildPasswordMapFromPages(entry.pages);
              const normalizedType = entry.type === 'dfl' ? 'pdfl' : entry.type;

              updateProgressJob(
                requestId,
                {
                  stage: normalizedType === 'pdfl' ? 'decrypting' : 'downloading',
                  message: `Preparing ${urls.length} source file${urls.length === 1 ? '' : 's'}`,
                  current: 0,
                  total: urls.length,
                },
                `Edition resolved (${normalizedType || 'unknown'} mode)`
              );

              let pdfData: Uint8Array | null = null;
              let pagesAdded = 0;
              let generationFailures: string[] = [];

              if (normalizedType === 'pdfl') {
                updateProgressJob(
                  requestId,
                  { stage: 'decrypting', message: 'Decrypting locked PDF sources' },
                  'Calling external decrypt service'
                );

                const lockedResult = await mergeLockedPdfsWithCloudRun(urls, passwordMap, (message, log, current, total) => {
                  updateProgressJob(
                    requestId,
                    { stage: 'decrypting', message, current, total },
                    log
                  );
                });
                pdfData = lockedResult.pdfData;
                pagesAdded = lockedResult.pagesAdded;
                generationFailures = lockedResult.failures;

                // Locked PDF flow must produce real decrypted output; avoid weak fallbacks that can generate blank PDFs.
                if (!pdfData) {
                  updateProgressJob(
                    requestId,
                    { status: 'error', stage: 'error', message: 'Locked PDF decryption failed for this edition' },
                    'All locked-PDF decryption attempts failed; returning explicit error to avoid blank output'
                  );

                  return NextResponse.json(
                    {
                      success: false,
                      requestId,
                      error:
                        'Unable to decrypt locked PDF sources for this edition right now. Please try again later or choose another edition.',
                      details: generationFailures,
                    },
                    { status: 422 }
                  );
                }
              } else {
                const generated = await generatePdfFromUrls(
                  urls,
                  (current, total, message, log) => {
                    updateProgressJob(
                      requestId,
                      { stage: 'downloading', message, current, total },
                      log
                    );
                  },
                  (finalPagesAdded) => {
                    updateProgressJob(
                      requestId,
                      {
                        stage: 'merging',
                        message: 'Finalizing PDF document...',
                        current: finalPagesAdded,
                        total: finalPagesAdded,
                      },
                      'Compacting and preparing final download'
                    );
                  }
                );
                pdfData = generated.pdfData;
                pagesAdded = generated.pagesAdded;
              }
              
              if (pdfData) {
                updateProgressJob(
                  requestId,
                  {
                    status: 'running',
                    stage: 'merging',
                    message: 'Finalizing PDF document...',
                    current: pagesAdded,
                    total: pagesAdded,
                  },
                  'Converting to downloadable format'
                );

                updateProgressJob(
                  requestId,
                  {
                    status: 'complete',
                    stage: 'complete',
                    message: `Download ready (${pagesAdded} page${pagesAdded === 1 ? '' : 's'})`,
                    current: pagesAdded,
                    total: pagesAdded,
                  },
                  'PDF generation complete'
                );

                const fileId = crypto.randomUUID();
                const fileName = `newspaper_${date}_${newspaper}.pdf`;
                generatedFiles.set(fileId, {
                  pdfData,
                  createdAt: Date.now(),
                  fileName,
                });
                
                return NextResponse.json({
                  success: true,
                  requestId,
                  fileId,
                  pagesAdded,
                  source: 'live',
                  isPasswordProtected: normalizedType === 'pdfl',
                });
              }

              updateProgressJob(
                requestId,
                {
                  status: 'error',
                  stage: 'error',
                  message: 'No printable pages were returned',
                  current: 0,
                },
                'Generation completed with zero printable pages'
              );

              return NextResponse.json(
                {
                  success: false,
                  requestId,
                  error:
                    'No printable pages were returned for this edition. The source may be locked or unavailable right now.',
                  details: generationFailures,
                },
                { status: 422 }
              );
            }
          }
        }
      }
    }

    updateProgressJob(
      requestId,
      { status: 'error', stage: 'error', message: 'Edition not found in live data' },
      'No matching language/newspaper/edition was resolved'
    );
    
    return NextResponse.json(
      {
        success: false,
        requestId,
        error: 'Unable to generate PDF. The newspaper may not be available.',
      },
      { status: 404 }
    );
    
  } catch (error) {
    if (requestId) {
      updateProgressJob(
        requestId,
        { status: 'error', stage: 'error', message: 'Unexpected server error occurred' },
        'Internal processing error'
      );
    }

    // Log full error for debugging but don't expose details to client
    console.error('PDF API error:', error);
    
    // Return sanitized error response
    return NextResponse.json(
      { 
        success: false, 
        requestId, 
        error: 'An unexpected error occurred. Please try again later.' 
      },
      { status: 500 }
    );
  }
}
