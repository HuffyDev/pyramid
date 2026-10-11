/** Browser Solana wallet (Phantom, Solflare, Backpack… anything exposing the standard provider). */

interface PublicKeyLike {
  toString(): string;
}
export interface SolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: PublicKeyLike | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKeyLike } | void>;
  disconnect(): Promise<void>;
  on?(event: 'connect' | 'disconnect' | 'accountChanged', cb: (arg?: PublicKeyLike | null) => void): void;
  signMessage?(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array } | Uint8Array>;
}

declare global {
  interface Window {
    phantom?: { solana?: SolanaProvider };
    solflare?: SolanaProvider;
    backpack?: SolanaProvider;
    solana?: SolanaProvider;
  }
}

export interface WalletOption {
  id: 'phantom' | 'solflare' | 'backpack';
  name: string;
  installUrl: string;
  get: () => SolanaProvider | undefined;
}

export const WALLETS: WalletOption[] = [
  { id: 'phantom', name: 'Phantom', installUrl: 'https://phantom.com/download', get: () => window.phantom?.solana ?? (window.solana?.isPhantom ? window.solana : undefined) },
  { id: 'solflare', name: 'Solflare', installUrl: 'https://solflare.com/download', get: () => window.solflare },
  { id: 'backpack', name: 'Backpack', installUrl: 'https://backpack.app/download', get: () => window.backpack },
];

const LAST_KEY = 'discordmoney:wallet';

export async function connect(id: WalletOption['id'], silent = false): Promise<{ address: string; provider: SolanaProvider }> {
  const w = WALLETS.find((x) => x.id === id)!;
  const provider = w.get();
  if (!provider) throw new Error(`${w.name} is not installed.`);
  const res = await provider.connect(silent ? { onlyIfTrusted: true } : undefined);
  const key = (res && 'publicKey' in res ? res.publicKey : null) ?? provider.publicKey;
  if (!key) throw new Error('Wallet did not return an address.');
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* ignore */
  }
  return { address: key.toString(), provider };
}

export async function disconnect(id: WalletOption['id'] | null) {
  try {
    localStorage.removeItem(LAST_KEY);
  } catch {
    /* ignore */
  }
  const w = WALLETS.find((x) => x.id === id);
  await w?.get()?.disconnect().catch(() => undefined);
}

export function lastWallet(): WalletOption['id'] | null {
  try {
    return localStorage.getItem(LAST_KEY) as WalletOption['id'] | null;
  } catch {
    return null;
  }
}
