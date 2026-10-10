import { describe, expect, it } from 'vitest';
import expected from './fixtures/pumpportal-create-body.json';
import { buildRequestSchema } from '../shared/launch.js';
import { buildCreateBody, fetchCreateTx, inspectCreateTx } from '../server/services/pumpportal.js';
import { creator, fakeCreateTx, mint, stranger } from './fixtures/keys.js';
import { buildReq, mockFetch } from './helpers.js';

describe('PumpPortal create body', () => {
  it('matches the documented trade-local create shape exactly', () => {
    const req = buildRequestSchema.parse(buildReq());
    const body = buildCreateBody(req);
    expect(body).toEqual({ ...expected, publicKey: creator.publicKey.toBase58(), mint: mint.publicKey.toBase58() });
    expect(body.tokenMetadata.symbol).toBe('SCAT'); // uppercased by validation
  });
});

describe('fetchCreateTx', () => {
  it('returns raw bytes on 200', async () => {
    const bytes = fakeCreateTx().serialize();
    const { impl, calls } = mockFetch({ 'https://pp.test': () => new Response(bytes, { status: 200 }) });
    const out = await fetchCreateTx('https://pp.test/api/trade-local', { a: 1 } as never, impl);
    expect(out).toEqual(new Uint8Array(bytes));
    expect(calls[0].body).toEqual({ a: 1 });
  });

  it('surfaces upstream 400 text', async () => {
    const { impl } = mockFetch({ 'https://pp.test': () => new Response("Cannot read properties of undefined (reading 'toBuffer')", { status: 400 }) });
    await expect(fetchCreateTx('https://pp.test/x', {} as never, impl)).rejects.toMatchObject({ status: 400, body: expect.stringContaining('toBuffer') });
  });

  it('rejects truncated bodies', async () => {
    const { impl } = mockFetch({ 'https://pp.test': () => new Response('ok', { status: 200 }) });
    await expect(fetchCreateTx('https://pp.test/x', {} as never, impl)).rejects.toThrow(/truncated/);
  });
});

describe('inspectCreateTx', () => {
  const expect_ = { creator: creator.publicKey.toBase58(), mint: mint.publicKey.toBase58() };

  it('accepts a well-formed create tx', () => {
    const r = inspectCreateTx(fakeCreateTx().serialize(), expect_);
    expect(r.signers).toHaveLength(2);
    expect(r.signers[0]).toBe(expect_.creator);
  });

  it('rejects wrong fee payer', () => {
    expect(() => inspectCreateTx(fakeCreateTx({ payer: stranger }).serialize(), expect_)).toThrow(/fee payer/);
  });

  it('rejects a tx where the mint is not a signer', () => {
    expect(() => inspectCreateTx(fakeCreateTx({ mintKp: stranger }).serialize(), expect_)).toThrow(/mint/);
  });

  it('rejects unexpected extra signers', () => {
    expect(() => inspectCreateTx(fakeCreateTx({ extraSigner: stranger }).serialize(), expect_)).toThrow(/unexpected signers/);
  });

  it('rejects garbage', () => {
    expect(() => inspectCreateTx(new Uint8Array(200).fill(255), expect_)).toThrow(/not a valid/);
  });
});
