import { fetchSafe, UpstreamError, type FetchLike } from './http.js';

interface RpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

export class Rpc {
  constructor(
    private url: string,
    private fetchImpl?: FetchLike,
  ) {}

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const res = await fetchSafe(this.url, {
      service: 'Helius RPC',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      timeoutMs: 15_000,
      retries: 2,
      fetchImpl: this.fetchImpl,
    });
    const json = (await res.json().catch(() => null)) as RpcResponse<T> | null;
    if (!json) throw new UpstreamError('Helius RPC', `bad JSON (HTTP ${res.status})`);
    if (json.error) throw new UpstreamError('Helius RPC', json.error.message);
    return json.result as T;
  }

  simulate(txBase64: string) {
    return this.call<{ value: { err: unknown; logs: string[] | null; unitsConsumed?: number } }>('simulateTransaction', [
      txBase64,
      { encoding: 'base64', sigVerify: true, replaceRecentBlockhash: false, commitment: 'processed' },
    ]);
  }

  send(txBase64: string) {
    return this.call<string>('sendTransaction', [
      txBase64,
      { encoding: 'base64', skipPreflight: false, preflightCommitment: 'processed', maxRetries: 3 },
    ]);
  }

  async confirm(signature: string, timeoutMs = 60_000): Promise<'confirmed' | 'failed' | 'timeout'> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const r = await this.call<{ value: Array<{ confirmationStatus?: string; err: unknown } | null> }>('getSignatureStatuses', [
        [signature],
        { searchTransactionHistory: false },
      ]).catch(() => null);
      const s = r?.value?.[0];
      if (s?.err) return 'failed';
      if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return 'confirmed';
      await new Promise((res) => setTimeout(res, 1500));
    }
    return 'timeout';
  }
}
