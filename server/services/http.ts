export class UpstreamError extends Error {
  constructor(
    public service: string,
    message: string,
    public status?: number,
    public body?: string,
  ) {
    super(`${service}: ${message}`);
  }
}

export type FetchLike = typeof fetch;

export interface FetchOpts extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  service: string;
  fetchImpl?: FetchLike;
}

/** fetch with timeout + retry on network errors / 429 / 5xx. Never retries 4xx. */
export async function fetchSafe(url: string, opts: FetchOpts): Promise<Response> {
  const { timeoutMs = 10_000, retries = 1, service, fetchImpl = fetch, ...init } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new UpstreamError(service, `HTTP ${res.status}`, res.status, await safeText(res));
      } else {
        return res;
      }
    } catch (e) {
      lastErr = new UpstreamError(service, (e as Error).name === 'AbortError' ? 'timed out' : (e as Error).message);
    } finally {
      clearTimeout(t);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
  }
  throw lastErr;
}

export async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '';
  }
}
