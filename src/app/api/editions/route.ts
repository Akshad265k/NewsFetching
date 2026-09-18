import { NextRequest, NextResponse } from 'next/server';
import { 
  fetchLiveData, 
  extractEditions,
  findMatchingKey,
} from '@/lib/api/tradingref';
import { validateDateString, validateLanguage, validateNewspaperName } from '@/lib/utils/sanitize';
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
    const newspaper = searchParams.get('newspaper');
    
    // Validate inputs
    if (!date || !language || !newspaper) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: date, language, newspaper' },
        { status: 400 }
      );
    }
    
    if (!validateDateString(date)) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format' },
        { status: 400 }
      );
    }
    
    if (!validateLanguage(language) || !validateNewspaperName(newspaper)) {
      return NextResponse.json(
        { success: false, error: 'Invalid parameters' },
        { status: 400 }
      );
    }
    
    // Fetch live data from TradingRef
    const liveData = await fetchLiveData(date);
    
    if (liveData) {
      // Find original keys
      const originalLangKey = findMatchingKey(Object.keys(liveData), language);
      
      if (originalLangKey && liveData[originalLangKey]) {
        const originalPaperKey = findMatchingKey(
          Object.keys(liveData[originalLangKey]),
          newspaper
        );
        
        if (originalPaperKey) {
          const editions = extractEditions(liveData, originalLangKey, originalPaperKey);
          
          return NextResponse.json({
            success: true,
            editions,
            source: 'live',
          }, {
            headers: {
              'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
            },
          });
        }
      }
    }
    
    return NextResponse.json(
      { success: false, error: 'No editions found for this newspaper.' },
      { status: 404 }
    );
    
  } catch (error) {
    // Log for debugging but don't expose details
    console.error('Editions API error:', error);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}
