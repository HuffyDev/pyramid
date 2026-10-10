import { describe, expect, it } from 'vitest';
import { checkLaunchFields, checkText, normalize } from '../shared/filter.js';
import { createLauncher } from '../server/services/launcher.js';
import { memoryStore } from '../server/db/store.js';
import { buildReq, mockFetch, testEnv } from './helpers.js';

const blocked = (s: string) => !checkText(s).ok;

describe('content filter', () => {
  it('blocks slurs, including leetspeak, spacing and repeats', () => {
    for (const s of ['nigger coin', 'N1GG3R', 'n.i.g.g.a', 'niiiggaaa', 'FAGGOT', 'f4gg0t', 'retard inu', 'r3tard', 'kike', 'spics', 'tranny', 'chink', '$KIKE', 'Sand N1gger']) {
      expect(blocked(s), s).toBe(true);
    }
  });

  it('does not block innocent words that contain a slur substring (Scunthorpe)', () => {
    for (const s of ['snigger', 'Niger', 'Nigeria', 'spice', 'spicy', 'raccoon', 'cocoon', 'tycoon', 'Scunthorpe', 'Dickens', 'chinking glasses', 'fagin', 'hopscotch', 'transport', 'retardant']) {
      expect(checkText(s).ok, s).toBe(true);
    }
  });

  it('allows ordinary memecoin crudeness', () => {
    for (const s of ['Shit Coin', 'FARTCOIN', 'damn frog', 'WTF', 'ass brick', 'pump it']) expect(checkText(s).ok, s).toBe(true);
  });

  it('blocks hate symbols, minors, self-harm and scam wording', () => {
    expect(checkText('Hitler Cat').reasons).toContain('hate symbol or slogan');
    expect(checkText('1488').reasons).toContain('hate symbol or slogan');
    expect(checkText('heil frog').ok).toBe(false);
    expect(checkText('loli coin').reasons).toContain('sexual content involving minors');
    expect(checkText('KYS').reasons).toContain('self-harm incitement');
    expect(checkText('enter your seed phrase to claim').reasons).toContain('scam / phishing wording');
    expect(checkText('claim your free airdrop').ok).toBe(false);
    expect(checkText('verify your wallet').ok).toBe(false);
  });

  it('normalizes leetspeak but not the $ ticker prefix', () => {
    expect(normalize('$PYR4M1D')).toBe(' pyramid');
    expect(normalize('ca$h')).toBe('cash');
  });

  it('checks each field and slurs split across name + ticker', () => {
    expect(checkLaunchFields({ name: 'Sand Cat', ticker: 'SCAT', description: 'just a brick' }).ok).toBe(true);
    const r = checkLaunchFields({ name: 'ok', ticker: 'NIGGA', description: '' });
    expect(r.ok).toBe(false);
    expect(r.fields.ticker).toEqual(['slur']);
    expect(checkLaunchFields({ name: 'Fag', ticker: 'GOT' }).ok).toBe(false);
  });

  it('is enforced server-side at build, before anything reaches PumpPortal', async () => {
    const { impl, calls } = mockFetch({});
    const l = createLauncher({ env: testEnv(), store: memoryStore(), fetchImpl: impl });
    const req = buildReq({ fields: { name: 'Hitler Frog', ticker: 'HFROG', description: '' } });
    await expect(l.build(req)).rejects.toMatchObject({ status: 422, code: 'content_blocked' });
    expect(calls).toHaveLength(0);
  });
});
