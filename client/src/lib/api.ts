import type { LaunchView, PublicConfig } from '../../../shared/launch';
import type { BrickView } from '../../../shared/pyramid';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError('Network error — check your connection.', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body.code);
  return body as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export interface UploadResponse {
  metadataUri: string;
  imageUri: string | null;
  provider: 'pump' | 'pinata' | 'local';
  warnings: string[];
}
export type BuildResponse =
  | { mode: 'tx'; tx: string; launch: LaunchView }
  | { mode: 'mock'; message: string; reason: string; launch: LaunchView };
export interface SendResponse {
  launch: LaunchView;
  simulation?: { logs: string[]; unitsConsumed: number | null; skipped?: string };
  error?: string;
}

export interface BrickDetail {
  brick: BrickView;
  detail: { description: string; website: string | null; twitter: string | null; telegram: string | null; signature: string | null };
  total: number;
}

const adminHeaders = (token: string, body?: unknown): RequestInit => ({
  method: body === undefined ? 'GET' : 'POST',
  headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export interface AdminStatus {
  settings: { PYRAMID_MINT: string | null; DRY_RUN: boolean; SIM_MODE: boolean };
  heliusConfigured: boolean;
  db: { state: 'none' | 'connecting' | 'ready' | 'failed'; error: string | null; hint: string | null; attempts: number };
  bricks: number;
  hidden: { n: number; mint: string; name: string; ticker: string }[];
}

export const api = {
  config: () => req<PublicConfig>('/api/config'),
  filter: (f: { name: string; ticker: string; description: string }) => req<{ ok: true }>('/api/filter', json(f)),
  upload: (form: FormData) => req<UploadResponse>('/api/upload', { method: 'POST', body: form }),
  build: (body: unknown) => req<BuildResponse>('/api/launch/build', json(body)),
  send: (body: unknown) => req<SendResponse>('/api/launch/send', json(body)),
  launch: (id: string) => req<{ launch: LaunchView }>(`/api/launch/${id}`),
  brick: (mint: string) => req<BrickDetail>(`/api/bricks/${mint}`),
  admin: {
    status: (t: string) => req<AdminStatus>('/api/admin/status', adminHeaders(t)),
    bricks: (t: string, q: string) => req<{ bricks: { n: number; mint: string; name: string; ticker: string; hidden: boolean; sim: boolean }[] }>(`/api/admin/bricks?q=${encodeURIComponent(q)}`, adminHeaders(t)),
    set: (t: string, key: string, value: unknown) => req<{ ok: true }>('/api/admin/settings', adminHeaders(t, { key, value })),
    hide: (t: string, ref: string, hidden: boolean) => req<{ ok: true }>('/api/admin/hide', adminHeaders(t, { ref, hidden })),
  },
};
