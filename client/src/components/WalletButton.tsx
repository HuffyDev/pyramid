import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '../wallet/WalletModal';
import { short } from '../lib/format';
import { useCopy } from '../lib/hooks';
import { Icon } from './Icon';

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { publicKey, wallet, disconnect, connecting } = useWallet();
  const { open } = useWalletModal();
  const [menu, setMenu] = useState(false);
  const { copied, copy } = useCopy();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menu]);

  if (!publicKey) {
    return (
      <button className={compact ? 'btn-ghost px-3 py-2' : 'btn-ghost'} onClick={open} disabled={connecting}>
        <Icon name="wallet" />
        {connecting ? 'Connecting…' : 'Connect'}
      </button>
    );
  }
  const addr = publicKey.toBase58();
  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost px-3 py-2" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
        {wallet?.adapter.icon && <img src={wallet.adapter.icon} alt="" className="h-4 w-4" />}
        <span className="num text-[13px]">{short(addr)}</span>
        <Icon name="down" size={14} className="text-sand-400" />
      </button>
      {menu && (
        <div className="absolute right-0 top-full z-50 mt-2 w-52 animate-rise overflow-hidden rounded-xl border border-sand-50/10 bg-night-850 p-1 shadow-gold-lg">
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-night-750" onClick={() => copy(addr)}>
            <Icon name={copied ? 'check' : 'copy'} className={copied ? 'text-gold' : 'text-sand-400'} />
            {copied ? 'Copied' : 'Copy address'}
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-night-750"
            onClick={() => {
              setMenu(false);
              open();
            }}
          >
            <Icon name="refresh" className="text-sand-400" /> Change wallet
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-bad hover:bg-night-750"
            onClick={() => {
              setMenu(false);
              disconnect();
            }}
          >
            <Icon name="x" /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
