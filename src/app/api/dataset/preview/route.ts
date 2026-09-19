import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const relPath = searchParams.get('path');

    if (!relPath) {
      return NextResponse.json(
        { success: false, error: 'Missing path parameter' },
        { status: 400 }
      );
    }

    const projectRoot = process.cwd();
    const datasetDir = path.join(projectRoot, 'dataset');
    const safeTarget = path.resolve(datasetDir, relPath);

    // Prevent directory traversal: ensure safeTarget starts with datasetDir
    if (!safeTarget.startsWith(datasetDir)) {
      return NextResponse.json(
        { success: false, error: 'Access denied: Path outside dataset' },
        { status: 403 }
      );
    }

    if (!fs.existsSync(safeTarget) || !fs.statSync(safeTarget).isFile()) {
      return NextResponse.json(
        { success: false, error: 'Image file not found' },
        { status: 404 }
      );
    }

    const fileBuffer = fs.readFileSync(safeTarget);
    const ext = path.extname(safeTarget).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.pdf' ? 'application/pdf' : 'image/jpeg';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to serve image' },
      { status: 500 }
    );
  }
}
