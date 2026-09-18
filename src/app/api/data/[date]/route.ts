import { NextRequest, NextResponse } from 'next/server';
import { 
  fetchLiveData, 
  extractLanguages,
  getAvailableSnapshotDates,
} from '@/lib/api/tradingref';
import { validateDateString } from '@/lib/utils/sanitize';
import { rateLimit, RateLimitPresets } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ date: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.standard);
  if (!rateLimitResult.success) {
    return rateLimitResult.response;
  }

  try {
    const { date } = await params;
    
    // Validate date format
    if (!validateDateString(date)) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format. Use YYYYMMDD.' },
        { status: 400 }
      );
    }
    
    // Fetch live data from TradingRef or snapshot
    const liveData = await fetchLiveData(date);
    
    if (liveData && Object.keys(liveData).length > 0) {
      const languages = extractLanguages(liveData);
      
      return NextResponse.json({
        success: true,
        date,
        languages,
        languageCount: languages.length,
        source: 'snapshot',
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      });
    }
    
    // No data available
    const availableDates = getAvailableSnapshotDates();
    const formattedDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const availableDatesStr = availableDates.map(d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`).join(', ');

    return NextResponse.json(
      { 
        success: false, 
        error: `No archive found for ${formattedDate}. Available local snapshot: ${availableDatesStr || 'March 30, 2026'}. Live TradingRef server is currently offline.`,
        date,
        availableDates
      },
      { status: 404 }
    );
    
  } catch (error) {
    // Log for debugging but don't expose details
    console.error('Date API error:', error);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}
