import { fetchSafe, safeText, UpstreamError, type FetchLike } from './http.js';

export interface UploadInput {
  image: { bytes: Buffer; filename: string; mime: string };
  name: string;
  symbol: string;
  description: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

export interface UploadResult {
  metadataUri: string;
  imageUri: string | null;
  provider: 'pump' | 'pinata' | 'local';
}

/** pump.fun IPFS: multipart → { metadataUri, metadata: { image } } */
export async function uploadPumpIpfs(url: string, input: UploadInput, fetchImpl?: FetchLike): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(input.image.bytes)], { type: input.image.mime }), input.image.filename);
  form.append('name', input.name);
  form.append('symbol', input.symbol);
  form.append('description', input.description);
  form.append('website', input.website ?? '');
  form.append('twitter', input.twitter ?? '');
  form.append('telegram', input.telegram ?? '');
  form.append('showName', 'true');
  const res = await fetchSafe(url, { service: 'pump.fun IPFS', method: 'POST', body: form, timeoutMs: 30_000, retries: 1, fetchImpl });
  if (!res.ok) throw new UpstreamError('pump.fun IPFS', `HTTP ${res.status}`, res.status, await safeText(res));
  const json = (await res.json().catch(() => null)) as { metadataUri?: string; metadata?: { image?: string } } | null;
  if (!json?.metadataUri) throw new UpstreamError('pump.fun IPFS', 'no metadataUri in response');
  return { metadataUri: json.metadataUri, imageUri: json.metadata?.image ?? null, provider: 'pump' };
}

/** Pinata fallback: upload image, then metadata JSON pointing at it. */
export async function uploadPinata(jwt: string, input: UploadInput, fetchImpl?: FetchLike): Promise<UploadResult> {
  const gw = (cid: string) => `https://ipfs.io/ipfs/${cid}`;
  const put = async (blob: Blob, filename: string) => {
    const form = new FormData();
    form.append('file', blob, filename);
    form.append('network', 'public');
    const res = await fetchSafe('https://uploads.pinata.cloud/v3/files', {
      service: 'Pinata',
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
      timeoutMs: 30_000,
      fetchImpl,
    });
    if (!res.ok) throw new UpstreamError('Pinata', `HTTP ${res.status}`, res.status, await safeText(res));
    const j = (await res.json().catch(() => null)) as { data?: { cid?: string } } | null;
    if (!j?.data?.cid) throw new UpstreamError('Pinata', 'no cid in response');
    return j.data.cid;
  };
  const imgCid = await put(new Blob([new Uint8Array(input.image.bytes)], { type: input.image.mime }), input.image.filename);
  const meta = {
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    image: gw(imgCid),
    showName: true,
    createdOn: 'https://pump.fun',
    ...(input.website ? { website: input.website } : {}),
    ...(input.twitter ? { twitter: input.twitter } : {}),
    ...(input.telegram ? { telegram: input.telegram } : {}),
  };
  const metaCid = await put(new Blob([JSON.stringify(meta)], { type: 'application/json' }), 'metadata.json');
  return { metadataUri: gw(metaCid), imageUri: gw(imgCid), provider: 'pinata' };
}
