/** Base class for every error thrown by @hu-apis packages. */
export class HuApiError extends Error {
  override name = 'HuApiError';
}

/** The upstream service answered with a non-2xx status. */
export class HttpError extends HuApiError {
  override name = 'HttpError';

  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`HTTP ${status} from ${url}`);
  }
}

/** The request did not complete within the configured timeout. */
export class TimeoutError extends HuApiError {
  override name = 'TimeoutError';

  constructor(
    readonly url: string,
    readonly timeoutMs: number,
  ) {
    super(`Request to ${url} timed out after ${timeoutMs} ms`);
  }
}

/** The upstream response could not be parsed into the documented shape. */
export class ParseError extends HuApiError {
  override name = 'ParseError';
}

/** The caller passed arguments the upstream API would reject or silently misinterpret. */
export class ValidationError extends HuApiError {
  override name = 'ValidationError';
}
