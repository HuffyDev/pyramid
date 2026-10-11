const HEX = '0123456789ABCDEF';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rand: () => number = Math.random;
/** Used by the seeder so sample data is identical on every reset. */
export function withRandom<T>(r: () => number, fn: () => T): T {
  const prev = rand;
  rand = r;
  try {
    return fn();
  } finally {
    rand = prev;
  }
}

const pick = (alphabet: string, n: number) =>
  Array.from({ length: n }, () => alphabet[Math.floor(rand() * alphabet.length)]).join('');

export const hex = (n: number) => pick(HEX, n);
export const b58 = (n: number) => pick(B58, n);
export const uid = (prefix: string) => `${prefix}-${hex(8).toLowerCase()}`;

export const launchId = () => `dm-${hex(6).toLowerCase()}`;
export const demoMint = (ticker: string) => `DEMO-${ticker.slice(0, 6).toUpperCase()}-${hex(6)}`;
export const receiptId = (kind: 'PAY' | 'LCH' | 'FEE' | 'BUY' | 'ESC' | 'REF' | 'FAIL') => `DEMO-RCPT-${kind}-${hex(8)}`;
export const claimCode = () => `DCM-DEMO-${hex(4)}`;
export const randInt = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));
export const random = () => rand();
