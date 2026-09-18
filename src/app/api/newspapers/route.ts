import { NextRequest, NextResponse } from 'next/server';
import { 
  fetchLiveData, 
  extractNewspapers,
  findMatchingKey,
} from '@/lib/api/tradingref';
import { validateDateString, validateLanguage } from '@/lib/utils/sanitize';
import { rateLimit, RateLimitPresets } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.standard);
  if (!rateLimitResult.success) {
    return rateLimitResult.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const language = searchParams.get('language');
    
    // Validate inputs
    if (!date || !language) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: date, language' },
        { status: 400 }
      );
    }
    
    if (!validateDateString(date)) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format' },
        { status: 400 }
      );
    }
    
    if (!validateLanguage(language)) {
      return NextResponse.json(
        { success: false, error: 'Invalid language parameter' },
        { status: 400 }
      );
    }
    
    // Fetch live data from TradingRef
    const liveData = await fetchLiveData(date);
    
    if (liveData) {
      // Find the original language key (might have different casing)
      const originalLangKey = findMatchingKey(Object.keys(liveData), language);
      
      if (originalLangKey) {
        const newspapers = extractNewspapers(liveData, originalLangKey);
        
        return NextResponse.json({
          success: true,
          newspapers,
          source: 'live',
        }, {
          headers: {
            'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
          },
        });
      }
    }
    
    return NextResponse.json(
      { success: false, error: 'No newspapers found for this language.' },
      { status: 404 }
    );
    
  } catch (error) {
    // Log for debugging but don't expose details
    console.error('Newspapers API error:', error);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}
