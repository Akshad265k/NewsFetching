import { NextRequest, NextResponse } from 'next/server';
import { resolveEditionData, joinUrl } from '@/lib/api/tradingref';
import { validateDateString, validateLanguage, validateNewspaperName } from '@/lib/utils/sanitize';
import { rateLimit, RateLimitPresets } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rateLimitResult = await rateLimit(request, RateLimitPresets.standard);
  if (!rateLimitResult.success) {
    return rateLimitResult.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const language = searchParams.get('language');
    const newspaper = searchParams.get('newspaper');
    const edition = searchParams.get('edition');

    if (!date || !language || !newspaper || !edition) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: date, language, newspaper, edition' },
        { status: 400 }
      );
    }

    if (!validateDateString(date) || !validateLanguage(language) || !validateNewspaperName(newspaper)) {
      return NextResponse.json(
        { success: false, error: 'Invalid parameters format' },
        { status: 400 }
      );
    }

    const resolved = await resolveEditionData(date, language, newspaper, edition);
    if (!resolved || !resolved.entry || resolved.entry.pages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Edition could not be resolved from archive or live source' },
        { status: 404 }
      );
    }

    const { entry, originalPaperKey, originalEditionKey } = resolved;
    const urls = entry.pages.map((p) => joinUrl(entry.prefix, p));
    const normalizedType = entry.type === 'dfl' ? 'pdfl' : entry.type;

    return NextResponse.json({
      success: true,
      type: normalizedType,
      newspaper: originalPaperKey,
      edition: originalEditionKey,
      date,
      totalPages: urls.length,
      pages: urls,
      prefix: entry.prefix,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });

  } catch (error) {
    console.error('Reader API error:', error);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred while resolving reader pages' },
      { status: 500 }
    );
  }
}
