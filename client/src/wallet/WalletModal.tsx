import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState, type WalletName } from '@solana/wallet-adapter-base';
import { Icon } from '../components/Icon';
import { useLockBody } from '../lib/hooks';

const Ctx = createContext<{ open: () => void }>({ open: () => {} });
export const useWalletModal = () => useContext(Ctx);

const KNOWN = [
  { name: 'Phantom', url: 'https://phantom.app', deeplink: (u: string) => `https://phantom.app/ul/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(location.origin)}` },
  { name: 'Solflare', url: 'https://solflare.com', deeplink: (u: string) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(location.origin)}` },
  { name: 'Backpack', url: 'https://backpack.app', deeplink: null },
];

const isMobile = () => typeof navigator !== 'undefined' && /iphone|ipad|android/i.test(navigator.userAgent);

export function WalletModalProvider({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);
  const open = useCallback(() => setShow(true), []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {show && <WalletModal onClose={() => setShow(false)} />}
    </Ctx.Provider>
  );
}

function WalletModal({ onClose }: { onClose: () => void }) {
  const { wallets, select, connect, connecting, wallet, connected } = useWallet();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useLockBody(true);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  useEffect(() => {
    if (connected) onClose();
  }, [connected, onClose]);

  // select() then connect once the adapter switched
  useEffect(() => {
    if (!pending || !wallet || wallet.adapter.name !== pending || connected || connecting) return;
    connect().catch((e: Error) => {
      setError(e.message || 'Connection rejected');
      setPending(null);
    });
  }, [pending, wallet, connect, connected, connecting]);

  const rows = useMemo(() => {
    const installed = (n: string) => wallets.find((w) => w.adapter.name === n && (w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable));
    const known = KNOWN.map((k) => {
      const w = installed(k.name);
      return { ...k, w, detected: !!w, web: w?.readyState === WalletReadyState.Loadable };
    });
    const others = wallets
      .filter((w) => !KNOWN.some((k) => k.name === w.adapter.name) && w.readyState === WalletReadyState.Installed)
      .map((w) => ({ name: w.adapter.name as string, url: w.adapter.url, deeplink: null, w, detected: true, web: false }));
    return [...known, ...others].sort((a, b) => Number(b.detected && !b.web) - Number(a.detected && !a.web));
  }, [wallets]);

  const anyDetected = rows.some((r) => r.detected && !r.web);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal aria-label="Connect wallet">
      <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-[420px] animate-sheet sm:animate-rise rounded-t-3xl border border-sand-50/10 bg-night-850 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-gold-lg sm:rounded-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <div className="eyebrow">non-custodial</div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Connect a wallet</h2>
          </div>
          <button className="btn-quiet -mr-2 -mt-1 p-2" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <ul className="space-y-2">
          {rows.map((r) => {
            const icon = r.w?.adapter.icon;
            const busy = pending === r.name && connecting;
            const href = !r.detected ? (isMobile() && r.deeplink ? r.deeplink(location.href) : r.url) : undefined;
            const inner = (
              <>
                <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg border border-sand-50/10 bg-night-900">
                  {icon ? <img src={icon} alt="" className="h-6 w-6" /> : <Icon name="wallet" className="text-sand-400" />}
                </span>
                <span className="flex-1 text-left font-medium">{r.name}</span>
                <span className="font-mono text-[11px] uppercase tracking-widest text-sand-400">
                  {busy ? 'connecting…' : r.detected ? (r.web ? 'web wallet' : <span className="text-gold">detected</span>) : isMobile() && r.deeplink ? 'open app' : 'install'}
                </span>
              </>
            );
            const cls = 'flex w-full items-center gap-3 rounded-xl border border-sand-50/10 bg-night-900 px-3 py-2.5 transition hover:border-sand-50/20 hover:bg-night-800';
            return (
              <li key={r.name}>
                {r.detected ? (
                  <button
                    className={cls}
                    disabled={connecting}
                    onClick={() => {
                      setError(null);
                      setPending(r.name);
                      select(r.name as WalletName);
                    }}
                  >
                    {inner}
                  </button>
                ) : (
                  <a className={cls} href={href} target="_blank" rel="noreferrer">
                    {inner}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
        {error && <p className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <p className="mt-5 text-xs leading-relaxed text-sand-400">
          {anyDetected ? 'PYRAMID never sees your keys. Every transaction is signed in your wallet.' : 'No wallet detected in this browser. On mobile, open this site inside your wallet app.'}
        </p>
      </div>
    </div>
  );
}
