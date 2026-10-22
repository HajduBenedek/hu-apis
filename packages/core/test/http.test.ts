import { createHttpClient, HttpError, TimeoutError } from '@hu-apis/core';
import { describe, expect, it, vi } from 'vitest';

const ok = (body: string) => new Response(body, { status: 200 });
const status = (code: number) => new Response('upstream error', { status: code });

describe('createHttpClient', () => {
  it('returns the response body', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(ok('hello'));
    const client = createHttpClient({ fetch });

    await expect(client.requestText('https://example.test')).resolves.toBe('hello');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('retries 5xx responses and then succeeds', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(status(502))
      .mockResolvedValueOnce(ok('recovered'));
    const client = createHttpClient({ fetch, retries: 2, retryBaseDelayMs: 0 });

    await expect(client.requestText('https://example.test')).resolves.toBe('recovered');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('gives up after the configured number of retries', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => status(500));
    const client = createHttpClient({ fetch, retries: 2, retryBaseDelayMs: 0 });

    await expect(client.requestText('https://example.test')).rejects.toBeInstanceOf(HttpError);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry 4xx client errors', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(status(404));
    const client = createHttpClient({ fetch, retries: 3, retryBaseDelayMs: 0 });

    const error = await client.requestText('https://example.test').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(404);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('retries network failures', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(ok('back online'));
    const client = createHttpClient({ fetch, retryBaseDelayMs: 0 });

    await expect(client.requestText('https://example.test')).resolves.toBe('back online');
  });

  it('turns a hung request into a TimeoutError', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const client = createHttpClient({ fetch, timeoutMs: 20, retries: 0 });

    await expect(client.requestText('https://example.test')).rejects.toBeInstanceOf(TimeoutError);
  });

  it('lets the caller veto a retry', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(status(500));
    const client = createHttpClient({ fetch, retries: 3, retryBaseDelayMs: 0 });

    await expect(
      client.requestText('https://example.test', { isRetryable: () => false }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('stops retrying once the caller aborts', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
      controller.abort();
      return status(503);
    });
    const client = createHttpClient({ fetch, retries: 5, retryBaseDelayMs: 0 });

    await expect(
      client.requestText('https://example.test', { signal: controller.signal }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
