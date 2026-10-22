import { HttpError, HuApiError, TimeoutError } from './errors.js';

export interface HttpClientOptions {
  /** Custom fetch implementation, e.g. for tests or proxies. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Per-attempt timeout in milliseconds. Default: 10 000. */
  timeoutMs?: number;
  /** Retries after the first attempt for network errors, 429 and 5xx. Default: 2. */
  retries?: number;
  /** Base delay for exponential backoff in milliseconds. Default: 250. */
  retryBaseDelayMs?: number;
  /** Extra headers sent with every request. */
  headers?: Record<string, string>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  /**
   * Overrides the default retry decision, e.g. to stop retrying a deterministic
   * SOAP fault that the upstream reports as HTTP 500.
   */
  isRetryable?: (error: unknown) => boolean;
}

export interface HttpClient {
  requestText(url: string, options?: RequestOptions): Promise<string>;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const retries = options.retries ?? 2;
  const baseDelay = options.retryBaseDelayMs ?? 250;

  async function attempt(url: string, req: RequestOptions): Promise<string> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: req.method ?? 'GET',
        headers: { ...options.headers, ...req.headers },
        ...(req.body === undefined ? {} : { body: req.body }),
        signal,
      });
    } catch (error) {
      if (timeout.aborted) throw new TimeoutError(url, timeoutMs);
      throw error;
    }

    const body = await response.text();
    if (!response.ok) throw new HttpError(response.status, url, body);
    return body;
  }

  return {
    async requestText(url, req = {}) {
      for (let i = 0; ; i++) {
        try {
          return await attempt(url, req);
        } catch (error) {
          const retryable = (req.isRetryable ?? isRetryableError)(error);
          if (i >= retries || req.signal?.aborted || !retryable) throw error;
          await sleep(backoff(baseDelay, i));
        }
      }
    },
  };
}

/** Default retry policy: network failures, timeouts, 408/425/429 and 5xx. */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof HttpError) return RETRYABLE_STATUS.has(error.status);
  if (error instanceof TimeoutError) return true;
  // Anything else from fetch itself (DNS, reset connection) is a transient network failure;
  // our own errors are not.
  return !(error instanceof HuApiError);
}

/** Full-jitter exponential backoff: random value in [0, base * 2^attempt]. */
function backoff(base: number, attemptIndex: number): number {
  return Math.random() * base * 2 ** attemptIndex;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
