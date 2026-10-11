import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { connectWallet, loginDiscord } from '../lib/actions';
import { discordConfigured } from '../lib/discord';
import { DCM_CA, DCM_PUMP_URL, DCM_X_URL, solscanTx } from '../lib/fixtures';
import { compact, dateTime, int, shortAddr, solLabel } from '../lib/format';
import { platformTotals } from '../lib/ledger';
import { useApp } from '../lib/store';
import { WALLETS } from '../lib/wallet';
import { Icon, XGlyph } from './Icon';
import { Drawer, Modal } from './Overlay';
import { useToast } from './Toast';
import { useUI } from './UIState';
import { CopyButton, KV, Notice, Spinner, cx } from './ui';

export function GlobalPanels() {
  return (
    <>
      <ConnectModal />
      <TokenOverview />
      <HistoryDrawer />
    </>
  );
}

function ConnectModal() {
  const ui = useUI();
  const s = useApp();
  const toast = useToast();
  const loc = useLocation();
  const [busy, setBusy] = useState<string | null>(null);
  const opt =
    'group flex w-full items-center gap-3 rounded-lg border border-black/30 bg-card px-4 py-3 text-left transition-colors hover:border-blurple/60 hover:bg-hover disabled:cursor-default disabled:opacity-60 disabled:hover:border-black/30 disabled:hover:bg-card';
  return (
    <Modal open={ui.panel === 'connect'} onClose={ui.close} title="Connect" description="Connect a Solana wallet to launch and receive payouts. Log in with Discord to claim servers." size="sm">
      <div className="grid gap-2">
        <div className="label !mb-0">Wallet</div>
        {WALLETS.map((w) => {
          const installed = typeof window !== 'undefined' && Boolean(w.get());
          const active = s.wallet?.provider === w.id;
          return installed ? (
            <button
              key={w.id}
              type="button"
              className={opt}
              disabled={busy !== null || active}
              onClick={async () => {
                setBusy(w.id);
                const r = await connectWallet(w.id);
                setBusy(null);
                if (r.ok) {
                  toast.success(`${w.name} connected`, shortAddr(r.value, 6, 6));
                  ui.close();
                } else toast.error(`Could not connect ${w.name}`, r.error);
              }}
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blurple/20 text-blurple-light">
                {busy === w.id ? <Spinner size={18} /> : <Icon name="wallet" size={19} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">{w.name}</span>
                <span className="block text-[12.5px] text-ink-mute">{active ? `Connected · ${shortAddr(s.wallet!.address)}` : 'Detected'}</span>
              </span>
              {active ? <Icon name="check" className="text-mint-bright" /> : <Icon name="chevronRight" className="text-ink-mute group-hover:text-ink" />}
            </button>
          ) : (
            <a key={w.id} href={w.installUrl} target="_blank" rel="noreferrer noopener" className={opt}>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rail text-ink-mute">
                <Icon name="wallet" size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">{w.name}</span>
                <span className="block text-[12.5px] text-ink-mute">Not installed — get {w.name}</span>
              </span>
              <Icon name="arrowRight" size={15} className="-rotate-45 text-ink-mute" />
            </a>
          );
        })}
        <div className="label !mb-0 mt-2">Discord</div>
        <button
          type="button"
          className={opt}
          disabled={Boolean(s.discord) || !discordConfigured}
          onClick={() => {
            const r = loginDiscord(loc.pathname);
            if (!r.ok) toast.error('Discord login unavailable', r.error);
          }}
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blurple text-white">
            <Icon name="chat" size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink">Log in with Discord</span>
            <span className="block text-[12.5px] text-ink-mute">
              {s.discord ? `Logged in · @${s.discord.user.username}` : discordConfigured ? 'Reads your username and servers only' : 'Coming soon'}
            </span>
          </span>
          {s.discord ? <Icon name="check" className="text-mint-bright" /> : <Icon name="chevronRight" className="text-ink-mute group-hover:text-ink" />}
        </button>
      </div>
      <div className="mt-4">
        <Notice icon="lock">DiscordMoney never asks for your seed phrase or private key. Discord login only requests your username and server list.</Notice>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" className="btn-ghost" onClick={ui.close}>
          Close
        </button>
      </div>
    </Modal>
  );
}

function TokenOverview() {
  const ui = useUI();
  const s = useApp();
  const p = platformTotals(s.data);
  return (
    <Drawer open={ui.panel === 'token'} onClose={ui.close} title="$DP token" subtitle="Discord Pay · Solana">
      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-black/20 bg-gradient-to-br from-blurple/25 to-transparent p-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blurple text-lg font-black text-white">D</span>
          <div className="min-w-0">
            <div className="text-lg font-bold text-ink">Discord Pay ($DP)</div>
            <div className="mono truncate text-ink-mute">{shortAddr(DCM_CA, 8, 8)}</div>
          </div>
        </div>
        <div className="divide-y divide-line/50 px-4">
          <KV k="Contract address" v={<span className="inline-flex items-center"><span className="mono">{shortAddr(DCM_CA, 6, 6)}</span><CopyButton value={DCM_CA} iconOnly label="Copy CA" toast="Contract address copied" /></span>} />
          <KV k="X" v={<a href={DCM_X_URL} target="_blank" rel="noreferrer noopener" className="link">@Payondiscord</a>} />
          <KV k="Chart" v={<a href={DCM_PUMP_URL} target="_blank" rel="noreferrer noopener" className="link">pump.fun</a>} />
          <KV k="$DP burned" v={`${int(p.burned)} $DP`} />
          <KV k="Buybacks" v={p.count} />
        </div>
      </div>
      <h3 className="mb-2 mt-6 text-[13px] font-bold uppercase tracking-wide text-ink-soft">Platform revenue</h3>
      <div className="grid grid-cols-2 gap-2">
        <Mini label="Collected" value={solLabel(p.revenue)} />
        <Mini label="Spent on buybacks" value={solLabel(p.spent)} />
        <Mini label="Awaiting buyback" value={solLabel(p.available)} tone="mint" />
        <Mini label="$DP burned" value={compact(p.burned)} tone="fuchsia" />
      </div>
      <p className="mt-6 text-[13px] text-ink-mute">
        The platform keeps <b className="text-ink-body">10%</b> of creator fees. Platform revenue goes to $DP buybacks, and bought tokens are burned.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => ui.open('history')}>
          <Icon name="flame" size={15} /> Buyback history
        </button>
        <CopyButton value={DCM_CA} label="Copy CA" toast="Contract address copied" className="btn-outline !text-ink-body" />
        <a href={DCM_X_URL} target="_blank" rel="noreferrer noopener" className="btn-outline">
          <XGlyph size={13} /> Follow on X
        </a>
      </div>
    </Drawer>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'mint' | 'fuchsia' }) {
  return (
    <div className="inset px-3 py-2.5">
      <div className="kpi">{label}</div>
      <div className={cx('mt-1 text-[15px] font-bold', tone === 'mint' ? 'text-mint-bright' : tone === 'fuchsia' ? 'text-[#F68BC4]' : 'text-ink')}>{value}</div>
    </div>
  );
}

function HistoryDrawer() {
  const ui = useUI();
  const s = useApp();
  const p = platformTotals(s.data);
  const rows = [...s.data.buybacks].sort((a, b) => b.at - a.at);
  return (
    <Drawer open={ui.panel === 'history'} onClose={ui.close} title="Buyback & burn history" subtitle="$DP bought back with platform revenue">
      <div className="grid grid-cols-3 gap-2">
        <Mini label="Collected" value={solLabel(p.revenue, 2)} />
        <Mini label="Spent" value={solLabel(p.spent, 2)} />
        <Mini label="Burned" value={compact(p.burned)} tone="fuchsia" />
      </div>
      <ol className="mt-4 grid gap-2">
        {rows.length === 0 && <li className="inset px-4 py-8 text-center text-sm text-ink-mute">No buybacks yet. The first one runs once platform revenue builds up.</li>}
        {rows.map((b) => (
          <li key={b.id} className="inset p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                <Icon name="flame" size={14} className="text-[#F68BC4]" />
                {int(b.dcmBurned)} $DP burned
              </span>
              <span className="text-[12px] text-ink-mute">{dateTime(b.at)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-ink-mute">
              <span>Spent {solLabel(b.solSpent)}</span>
              {b.signature && (
                <a className="link" href={solscanTx(b.signature)} target="_blank" rel="noreferrer noopener">
                  View transaction
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-5 text-[12px] text-ink-mute">
        See every coin on <Link to="/launches" onClick={ui.close} className="link">Launches</Link>.
      </div>
    </Drawer>
  );
}
