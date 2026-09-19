import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function getDirectorySize(dirPath: string): number {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;

  try {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        size += getDirectorySize(fullPath);
      } else if (file.isFile()) {
        size += fs.statSync(fullPath).size;
      }
    }
  } catch {}
  return size;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const download = searchParams.get('download') === 'true';

    const projectRoot = process.cwd();
    const manifestPath = path.join(projectRoot, 'dataset', 'manifest.csv');
    const downloadedIssuesPath = path.join(projectRoot, 'dataset', 'downloaded_issues.json');
    const imagesDir = path.join(projectRoot, 'dataset', 'images');
    const pdfDir = path.join(projectRoot, 'dataset', 'pdf');

    // If download request, send CSV file
    if (download) {
      if (!fs.existsSync(manifestPath)) {
        return new NextResponse('id,date,language,newspaper,edition,page_number,image_path,pdf_path,source,source_url\n', {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="manifest.csv"',
          },
        });
      }
      const csvContent = fs.readFileSync(manifestPath, 'utf-8');
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="manifest.csv"',
        },
      });
    }

    // Parse manifest.csv
    const records: any[] = [];
    const languageCounts: Record<string, number> = {};
    const newspaperCounts: Record<string, number> = {};

    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, 'utf-8');
      const lines = content.split(/\r?\n/).filter(Boolean);
      const headers = lines[0] ? lines[0].split(',') : [];

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 8) {
          const row: Record<string, any> = {};
          headers.forEach((h, idx) => {
            row[h.trim()] = parts[idx]?.trim() || '';
          });
          records.push(row);

          const lang = (row.language || 'Unknown').toLowerCase();
          languageCounts[lang] = (languageCounts[lang] || 0) + 1;

          const paper = row.newspaper || 'Unknown';
          newspaperCounts[paper] = (newspaperCounts[paper] || 0) + 1;
        }
      }
    }

    // Parse downloaded_issues.json
    let downloadedIssues: Record<string, any> = {};
    if (fs.existsSync(downloadedIssuesPath)) {
      try {
        downloadedIssues = JSON.parse(fs.readFileSync(downloadedIssuesPath, 'utf-8'));
      } catch {}
    }

    const totalDiskSizeBytes = getDirectorySize(imagesDir) + getDirectorySize(pdfDir);
    const totalDiskSizeMb = (totalDiskSizeBytes / (1024 * 1024)).toFixed(2);

    return NextResponse.json({
      success: true,
      stats: {
        totalPages: records.length,
        totalIssues: Object.keys(downloadedIssues).length,
        diskSizeMb: totalDiskSizeMb,
        languageCounts,
        newspaperCounts,
      },
      recentPages: records.slice(-50).reverse(),
      issues: Object.values(downloadedIssues),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to read dataset manifest' },
      { status: 500 }
    );
  }
}
