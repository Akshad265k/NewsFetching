import { NextRequest, NextResponse } from 'next/server';

/**
 * Simple in-memory rate limiter using a Map to track request counts
 * For production with multiple instances, consider Redis-based solution like @upstash/ratelimit
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed within the window
   */
  maxRequests: number;
  
  /**
   * Time window in milliseconds
   */
  windowMs: number;
  
  /**
   * Key function to identify the requester (default: IP address)
   */
  keyGenerator?: (request: NextRequest) => string;
}

/**
 * Rate limiting middleware for API routes
 * 
 * @example
 * ```ts
 * export async function GET(request: NextRequest) {
 *   const rateLimitResult = await rateLimit(request, {
 *     maxRequests: 10,
 *     windowMs: 60 * 1000, // 1 minute
 *   });
 *   
 *   if (!rateLimitResult.success) {
 *     return rateLimitResult.response;
 *   }
 *   
 *   // Your API logic here
 * }
 * ```
 */
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig
): Promise<{ success: boolean; response?: NextResponse }> {
  const { maxRequests, windowMs, keyGenerator } = config;
  
  // Get client identifier (IP address by default)
  const key = keyGenerator 
    ? keyGenerator(request) 
    : getClientIp(request);
  
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  
  // No previous requests or window has reset
  if (!entry || entry.resetTime < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return { success: true };
  }
  
  // Within the time window
  if (entry.count < maxRequests) {
    entry.count++;
    return { success: true };
  }
  
  // Rate limit exceeded
  const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
  
  return {
    success: false,
    response: NextResponse.json(
      {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': entry.resetTime.toString(),
        },
      }
    ),
  };
}

/**
 * Extract client IP address from request headers
 * Checks common headers set by proxies/load balancers
 */
function getClientIp(request: NextRequest): string {
  // Check common headers for real IP (in order of preference)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp;
  }
  
  // Fallback to a generic identifier
  return 'unknown';
}

/**
 * Preset rate limit configurations for common use cases
 */
export const RateLimitPresets = {
  /**
   * Strict: 10 requests per minute
   * Good for resource-intensive operations (PDF generation, etc.)
   */
  strict: {
    maxRequests: 10,
    windowMs: 60 * 1000,
  },
  
  /**
   * Standard: 30 requests per minute
   * Good for regular API endpoints
   */
  standard: {
    maxRequests: 30,
    windowMs: 60 * 1000,
  },
  
  /**
   * Relaxed: 100 requests per minute
   * Good for frequently accessed endpoints
   */
  relaxed: {
    maxRequests: 100,
    windowMs: 60 * 1000,
  },
} as const;
