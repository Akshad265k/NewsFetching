/**
 * Utility functions for handling timeouts and retries with external API calls
 */

export interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number; // Timeout in milliseconds
}

export interface RetryConfig {
  maxRetries?: number;
  retryDelay?: number; // Delay between retries in milliseconds
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * Fetch with timeout support
 * Throws an error if the request takes longer than the specified timeout
 * 
 * @param url - The URL to fetch
 * @param options - Fetch options plus timeout
 * @returns Promise resolving to Response
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options; // Default 30s timeout
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Fetch with retry logic
 * Automatically retries failed requests with exponential backoff
 * 
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param retryConfig - Retry configuration
 * @returns Promise resolving to Response
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithTimeoutOptions = {},
  retryConfig: RetryConfig = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    shouldRetry = defaultShouldRetry,
  } = retryConfig;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);
      
      // Don't retry on 4xx errors (client errors)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }
      
      // Return successful responses
      if (response.ok || attempt === maxRetries) {
        return response;
      }
      
      // Create error for 5xx server errors to trigger retry
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      
      if (!shouldRetry(lastError, attempt)) {
        return response;
      }
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry if this is the last attempt
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Don't retry if shouldRetry returns false
      if (!shouldRetry(lastError, attempt)) {
        throw lastError;
      }
    }
    
    // Exponential backoff
    const delay = retryDelay * Math.pow(2, attempt);
    await sleep(delay);
  }
  
  throw lastError || new Error('Request failed after retries');
}

/**
 * Default retry logic
 * Retries on network errors and 5xx server errors
 */
function defaultShouldRetry(error: Error): boolean {
  // Always retry network errors and timeouts
  if (error.message.includes('timeout') || error.message.includes('fetch')) {
    return true;
  }
  
  // Retry server errors (5xx)
  if (error.message.includes('HTTP 5')) {
    return true;
  }
  
  // Don't retry other errors
  return false;
}

/**
 * Promise-based sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

/**
 * Simple circuit breaker implementation
 * Prevents cascading failures by temporarily blocking requests after repeated failures
 */
export class CircuitBreaker {
  private states = new Map<string, CircuitBreakerState>();
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  
  constructor(
    failureThreshold = 5,
    resetTimeout = 60000 // 1 minute
  ) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
  }
  
  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    key: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const state = this.getState(key);
    
    // Circuit is open - reject immediately
    if (state.state === 'open') {
      const timeSinceFailure = Date.now() - state.lastFailureTime;
      
      if (timeSinceFailure < this.resetTimeout) {
        throw new Error('Circuit breaker is open - service temporarily unavailable');
      }
      
      // Try to reset to half-open
      state.state = 'half-open';
    }
    
    try {
      const result = await fn();
      
      // Success - reset circuit
      if (state.state === 'half-open') {
        state.state = 'closed';
        state.failures = 0;
      }
      
      return result;
    } catch (error) {
      // Record failure
      state.failures++;
      state.lastFailureTime = Date.now();
      
      // Open circuit if threshold exceeded
      if (state.failures >= this.failureThreshold) {
        state.state = 'open';
      }
      
      throw error;
    }
  }
  
  private getState(key: string): CircuitBreakerState {
    if (!this.states.has(key)) {
      this.states.set(key, {
        failures: 0,
        lastFailureTime: 0,
        state: 'closed',
      });
    }
    return this.states.get(key)!;
  }
  
  /**
   * Reset circuit breaker for a specific key
   */
  reset(key: string): void {
    this.states.delete(key);
  }
}

// Global circuit breaker instance for external API calls
export const externalApiCircuitBreaker = new CircuitBreaker(5, 60000);
