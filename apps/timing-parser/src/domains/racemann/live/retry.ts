export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (err: unknown) => boolean;
}

export const defaultRetryOptions: RetryOptions = {
  attempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 2_000,
};

export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = defaultRetryOptions,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < opts.attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      if (opts.shouldRetry && !opts.shouldRetry(err)) throw err;
      if (i === opts.attempts - 1) break;
      const delay = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** i);
      const jittered = delay * (0.7 + Math.random() * 0.6);
      await sleep(jittered);
    }
  }
  throw lastErr;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function backoffDelayMs(attempt: number, baseMs: number, capMs: number): number {
  const exp = Math.min(capMs, baseMs * 2 ** attempt);
  return exp * (0.7 + Math.random() * 0.6);
}
