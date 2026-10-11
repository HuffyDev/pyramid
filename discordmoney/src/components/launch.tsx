import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BOT_NAME, solscanTx } from '../lib/fixtures';
import { dateTime, date, shortAddr, sol, solLabel, usd } from '../lib/format';
import { allTotals, isClaimed, latestMcap, launchStatus, payoutDestination, recipientName } from '../lib/ledger';
import type { FeeEvent, Launch, Payout, Snapshot } from '../lib/types';
import { Icon, XGlyph } from './Icon';
import { Emblem } from './Logo';
import { Modal } from './Overlay';
import { Avatar, CoinImage, CopyButton, KV, MonoId, ServerIcon, StatusBadge, cx } from './ui';

/* ------------------------------ Recipient line ----------------------------- */

export function RecipientInline({ launch, size = 18 }: { launch: Launch; size?: number }) {
  const r = launch.recipient;
  if (r.kind === 'member')
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Avatar name={r.username} user={r.discordId ? { id: r.discordId, username: r.username } : null} size={size} />
        <span className="truncate">@{r.username}</span>
      </span>
    );
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <ServerIcon name={r.serverName} iconUrl={r.iconUrl} id={r.serverId} size={size} />
      <span className="truncate">{r.serverName} treasury</span>
    </span>
  );
}

export function WalletStatus({ data, launch }: { data: Snapshot; launch: Launch }) {
  const dest = payoutDestination(data, launch);
  if (launch.recipient.kind === 'server' && !isClaimed(data, launch.recipient.serverId))
    return (
      <span className="inline-flex items-center gap-1 text-gold">
        <Icon name="lock" size={12} /> Treasury unclaimed
      </span>
    );
  return dest ? (
    <span className="inline-flex items-center gap-1 text-mint-bright">
      <Icon name="check" size={12} /> Linked <span className="mono text-ink-mute">{shortAddr(dest)}</span>
    </span>
  ) : (
    <span className="text-ink-mute">No linked wallet</span>
  );
}

/* --------------------------------- Cards ---------------------------------- */

export function LaunchCard({ data, launch }: { data: Snapshot; launch: Launch }) {
  const t = allTotals(data).get(launch.id)!;
  return (
    <Link
      to={`/launches/${launch.id}`}
      className="card group flex flex-col gap-3 p-4 transition-[transform,border-color,background-color] duration-150 hover:-translate-y-0.5 hover:border-blurple/50 hover:bg-[#2E3035]"
    >
      <div className="flex items-start gap-3">
        <CoinImage src={launch.imageUrl} name={launch.name} size={48} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-ink">{launch.name}</div>
          <div className="mono text-ink-mute">${launch.ticker}</div>
        </div>
        <div className="text-right">
          <div className="kpi !text-[10px]">Market cap</div>
          <div className="text-[14px] font-bold text-ink">{launch.mcap.length ? usd(latestMcap(launch)) : '—'}</div>
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2 text-[12.5px] text-ink-soft">
        <RecipientInline launch={launch} />
        <StatusBadge status={launchStatus(data, launch)} />
      </div>
      <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-deep p-2 text-center">
        <Cell label="Fees" value={sol(t.gross, 2)} />
        <Cell label="Paid" value={sol(t.paid, 2)} tone="mint" />
        <Cell label="Pending" value={sol(t.pending, 2)} tone={t.pending > 0 ? 'gold' : undefined} />
      </div>
      <div className="text-[11.5px] text-ink-dim">{date(launch.createdAt)}</div>
    </Link>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'mint' | 'gold' }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wide text-ink-dim">{label}</div>
      <div className={cx('truncate text-[13px] font-semibold', tone === 'mint' ? 'text-mint-bright' : tone === 'gold' ? 'text-gold' : 'text-ink')}>
        {value} <span className="text-[10px] font-medium text-ink-dim">SOL</span>
      </div>
    </div>
  );
}

export function Socials({ launch }: { launch: Launch }) {
  const items: { href: string; label: string; icon: ReactNode }[] = [];
  if (launch.socials.x) items.push({ href: launch.socials.x, label: 'X', icon: <XGlyph size={12} /> });
  if (launch.socials.discord) items.push({ href: launch.socials.discord, label: 'Discord', icon: <Icon name="chat" size={13} /> });
  if (launch.socials.website) items.push({ href: launch.socials.website, label: 'Website', icon: <Icon name="globe" size={13} /> });
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <a key={i.href} href={i.href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-full bg-rail px-2.5 py-1 text-[12px] text-ink-soft hover:bg-active hover:text-ink">
          {i.icon}
          {i.label}
        </a>
      ))}
    </div>
  );
}

export function LaunchRow({ data, launch, onTx }: { data: Snapshot; launch: Launch; onTx: (r: TxTarget) => void }) {
  const [open, setOpen] = useState(false);
  const t = allTotals(data).get(launch.id)!;
  const payouts = useMemo(() => data.payouts.filter((p) => p.launchId === launch.id).sort((a, b) => b.at - a.at), [data.payouts, launch.id]);
  return (
    <article className="card overflow-hidden">
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <div className="flex items-start gap-3.5">
            <CoinImage src={launch.imageUrl} name={launch.name} size={60} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[17px] font-bold text-ink">
                  <Link to={`/launches/${launch.id}`} className="hover:underline">
                    {launch.name}
                  </Link>
                </h3>
                <span className="mono text-ink-mute">${launch.ticker}</span>
                <StatusBadge status={launchStatus(data, launch)} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-mute">
                <span className="inline-flex items-center gap-1">
                  <Icon name="calendar" size={12} /> {date(launch.createdAt)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  Dev {launch.devUsername && <span className="text-ink-soft">@{launch.devUsername}</span>}
                  <span className="mono">{shortAddr(launch.devWallet)}</span>
                </span>
                {launch.mcap.length > 0 && (
                  <span>
                    Market cap <b className="text-ink">{usd(latestMcap(launch))}</b>
                  </span>
                )}
              </div>
            </div>
          </div>
          {launch.description && <p className="mt-3 line-clamp-2 text-[13.5px] leading-relaxed text-ink-soft">{launch.description}</p>}
          <div className="mt-3">
            <Socials launch={launch} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
            <span className="text-ink-mute">Recipient</span>
            <span className="text-ink-body">
              <RecipientInline launch={launch} />
            </span>
            <WalletStatus data={data} launch={launch} />
          </div>
        </div>
        <div className="inset grid grid-cols-2 gap-x-4 gap-y-2 p-3 text-[12.5px] lg:grid-cols-1 lg:gap-y-0">
          <Money k="Gross fees" v={t.gross} />
          <Money k="Platform share (10%)" v={t.platform} muted />
          <Money k="Recipient share (90%)" v={t.earned} />
          <Money k="Paid" v={t.paid} tone="mint" />
          <Money k="Pending" v={t.pending} tone={t.pending > 0 ? 'gold' : undefined} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-black/20 bg-deep/60 px-4 py-2.5 sm:px-5">
        <button type="button" className="btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <Icon name="chevronDown" size={14} className={cx('transition-transform', open && 'rotate-180')} />
          Payout history ({payouts.length})
        </button>
        <span className="flex-1" />
        <button type="button" className="btn-ghost btn-sm" onClick={() => onTx({ kind: 'launch', launch })}>
          <Icon name="receipt" size={14} /> Launch details
        </button>
        <Link to={`/launches/${launch.id}`} className="btn-secondary btn-sm">
          View launch <Icon name="arrowRight" size={14} />
        </Link>
      </div>
      {open && <PayoutTable payouts={payouts} launch={launch} onTx={onTx} />}
    </article>
  );
}

function Money({ k, v, tone, muted }: { k: string; v: number; tone?: 'mint' | 'gold'; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className={cx('truncate', muted ? 'text-ink-dim' : 'text-ink-mute')}>{k}</span>
      <span className={cx('shrink-0 font-semibold tabular-nums', tone === 'mint' ? 'text-mint-bright' : tone === 'gold' ? 'text-gold' : muted ? 'text-ink-soft' : 'text-ink')}>{sol(v)} SOL</span>
    </div>
  );
}

export function PayoutTable({ payouts, launch, onTx, launchOf }: { payouts: Payout[]; launch?: Launch; onTx: (r: TxTarget) => void; launchOf?: (id: string) => Launch | undefined }) {
  if (!payouts.length) return <div className="border-t border-black/20 px-5 py-6 text-center text-[13px] text-ink-mute">No payouts yet.</div>;
  return (
    <div className="overflow-x-auto border-t border-black/20">
      <table className="w-full min-w-[560px] text-left text-[12.5px]">
        <thead className="text-[10.5px] uppercase tracking-wide text-ink-dim">
          <tr>
            <th className="px-5 py-2 font-bold">When</th>
            {launchOf && <th className="px-3 py-2 font-bold">Coin</th>}
            <th className="px-3 py-2 font-bold">Amount</th>
            <th className="px-3 py-2 font-bold">Destination</th>
            <th className="px-3 py-2 font-bold">Result</th>
            <th className="px-5 py-2 text-right font-bold">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/20">
          {payouts.map((p) => {
            const l = launch ?? launchOf?.(p.launchId);
            return (
              <tr key={p.id} className="hover:bg-white/[0.02]">
                <td className="whitespace-nowrap px-5 py-2.5 text-ink-soft">{dateTime(p.at)}</td>
                {launchOf && (
                  <td className="px-3 py-2.5">
                    {l ? (
                      <Link to={`/launches/${l.id}`} className="inline-flex items-center gap-2 text-ink-body hover:underline">
                        <CoinImage src={l.imageUrl} name={l.name} size={20} className="!rounded-md" /> ${l.ticker}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink">{solLabel(p.amount)}</td>
                <td className="mono px-3 py-2.5 text-ink-mute">{shortAddr(p.to, 5, 5)}</td>
                <td className="px-3 py-2.5">
                  {p.status === 'completed' ? (
                    <span className="chip bg-mint/15 text-mint-bright">Completed</span>
                  ) : (
                    <span className="chip bg-danger/12 text-[#FF8A8D]" title={p.reason}>
                      Failed
                    </span>
                  )}
                </td>
                <td className="px-5 py-2.5 text-right">
                  {l && (
                    <button type="button" className="link text-[12px]" onClick={() => onTx({ kind: 'payout', payout: p, launch: l })}>
                      View
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------- Transaction modal --------------------------- */

export type TxTarget = { kind: 'launch'; launch: Launch } | { kind: 'payout'; payout: Payout; launch: Launch } | { kind: 'fee'; fee: FeeEvent; launch: Launch };

function SigRow({ sig }: { sig?: string }) {
  if (!sig) return <KV k="Transaction" v={<span className="text-ink-dim">Pending</span>} />;
  return (
    <KV
      k="Transaction"
      v={
        <span className="inline-flex items-center gap-1">
          <a href={solscanTx(sig)} target="_blank" rel="noreferrer noopener" className="link mono">
            {shortAddr(sig, 6, 6)}
          </a>
          <CopyButton value={sig} iconOnly label="Copy signature" toast="Signature copied" />
        </span>
      }
    />
  );
}

export function TxModal({ target, onClose }: { target: TxTarget | null; onClose: () => void }) {
  if (!target) return null;
  const l = target.launch;
  let title = 'Launch details';
  let rows: [string, ReactNode][] = [];
  let sig: string | undefined;
  if (target.kind === 'launch') {
    sig = l.signature;
    rows = [
      ['Coin', `${l.name} ($${l.ticker})`],
      ['Mint', <MonoId key="m" value={l.mint} />],
      ['Developer wallet', <MonoId key="d" value={l.devWallet} />],
      ['Dev buy', solLabel(l.devBuy)],
      ['Recipient', recipientName(l)],
      ['Created', dateTime(l.createdAt)],
    ];
  } else if (target.kind === 'payout') {
    const p = target.payout;
    sig = p.signature;
    title = p.status === 'completed' ? 'Payout' : 'Failed payout';
    rows = [
      ['Coin', `${l.name} ($${l.ticker})`],
      ['Amount', <b key="a" className="text-ink">{solLabel(p.amount, 9)}</b>],
      ['Recipient', recipientName(l)],
      ['Destination', <MonoId key="t" value={p.to} />],
      ['Result', p.status === 'completed' ? <span key="r" className="text-mint-bright">Completed</span> : <span key="r" className="text-[#FF8A8D]">Failed{p.reason ? ` — ${p.reason}` : ''}</span>],
      ['Time', dateTime(p.at)],
    ];
  } else {
    const f = target.fee;
    sig = f.signature;
    title = 'Fee event';
    rows = [
      ['Coin', `${l.name} ($${l.ticker})`],
      ['Gross', solLabel(f.gross, 9)],
      ['Platform (10%)', solLabel(f.platform, 9)],
      ['Recipient (90%)', solLabel(f.recipient, 9)],
      ['Time', dateTime(f.at)],
    ];
  }
  return (
    <Modal open onClose={onClose} title={title}>
      <div className="inset divide-y divide-line/40 px-4">
        {rows.map(([k, v]) => (
          <KV key={k} k={k} v={v} />
        ))}
        <SigRow sig={sig} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {sig && (
          <a href={solscanTx(sig)} target="_blank" rel="noreferrer noopener" className="btn-outline">
            View on Solscan <Icon name="arrowRight" size={14} className="-rotate-45" />
          </a>
        )}
        <button type="button" className="btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------ Discord preview ---------------------------- */

export function DiscordPreview({ launch, amount, at }: { launch: Pick<Launch, 'name' | 'ticker' | 'recipient' | 'payoutMessage' | 'imageUrl'>; amount: number; at: number }) {
  const r = launch.recipient;
  const serverName = r.kind === 'server' ? r.serverName : 'Your server';
  const channel = (r.kind === 'server' && r.channel) || 'announcements';
  const recipLabel = r.kind === 'member' ? `@${r.username}` : `${r.serverName} treasury`;
  return (
    <div className="overflow-hidden rounded-lg border border-black/30 bg-page">
      <div className="flex items-center justify-between gap-2 border-b border-black/30 px-3 py-2 shadow-[0_1px_0_rgba(4,4,5,0.2)]">
        <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <ServerIcon name={serverName} iconUrl={r.kind === 'server' ? r.iconUrl : undefined} size={18} rounded="rounded-full" />
          <span className="truncate font-semibold text-ink">{serverName}</span>
          <Icon name="hash" size={15} className="ml-1 shrink-0 text-ink-dim" />
          <span className="truncate font-semibold text-ink-body">{channel}</span>
        </div>
        <span className="chip shrink-0 bg-blurple/15 text-blurple-light ring-1 ring-inset ring-blurple/25">Announcement preview</span>
      </div>
      <div className="flex gap-3 px-3 py-3 hover:bg-[#2E3035]">
        <span className="mt-0.5 shrink-0">
          <Emblem size={36} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-[15px] font-semibold text-ink">{BOT_NAME}</span>
            <span className="rounded-[3px] bg-blurple px-1 text-[10px] font-semibold leading-[15px] text-white">APP</span>
            <span className="text-[11.5px] text-ink-dim">{dateTime(at)}</span>
          </div>
          <div className="mt-0.5 text-[14.5px] leading-[1.375] text-ink-body">
            <span className="rounded-[3px] bg-blurple/30 px-0.5 font-medium text-blurple-pale">{r.kind === 'member' ? `@${r.username}` : '@everyone'}</span>{' '}
            {launch.payoutMessage || `Creator fees from $${launch.ticker} are on the way.`}
          </div>
          <div className="mt-2 max-w-[440px] overflow-hidden rounded-[4px] border-l-4 border-blurple bg-card">
            <div className="flex gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-ink-soft">DiscordMoney</div>
                <div className="mt-1 text-[15px] font-semibold text-ink">{sol(amount)} SOL creator payout</div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                  <Field2 k="Coin" v={`$${launch.ticker}`} />
                  <Field2 k="Recipient" v={recipLabel} />
                  <Field2 k="Amount" v={`${sol(amount)} SOL`} />
                  <Field2 k="Split" v="90% recipient · 10% platform" />
                </div>
              </div>
              <CoinImage src={launch.imageUrl} name={launch.name} size={64} className="hidden sm:inline-flex" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field2({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] font-semibold text-ink">{k}</div>
      <div className="truncate text-ink-body">{v}</div>
    </div>
  );
}

/* --------------------------------- Chart ---------------------------------- */

export function McapChart({ series, height = 180 }: { series: number[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (series.length === 0)
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-center text-[13px] text-ink-mute">
        <Icon name="trend" size={22} />
        Market data will appear once trading starts.
      </div>
    );
  const W = 600;
  const H = height;
  const pad = { t: 12, r: 8, b: 20, l: 8 };
  const data = series.length > 1 ? series : [series[0], series[0]];
  const min = Math.min(...data) * 0.92;
  const max = Math.max(...data) * 1.04 || 1;
  const x = (i: number) => pad.l + (i / (data.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min || 1)) * (H - pad.t - pad.b);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`;
  const up = data[data.length - 1] >= data[0];
  const color = up ? '#57F287' : '#F23F43';
  const hi = hover ?? data.length - 1;
  return (
    <div className="relative">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <div className="text-[22px] font-bold text-ink">{usd(data[hi])}</div>
          <div className={cx('text-[12px] font-semibold', up ? 'text-mint-bright' : 'text-[#FF8A8D]')}>
            {up ? '▲' : '▼'} {Math.abs(((data[data.length - 1] - data[0]) / (data[0] || 1)) * 100).toFixed(1)}% since launch
          </div>
        </div>
        <span className="kpi">Market cap</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={`Market cap chart, latest ${usd(data[data.length - 1])}`}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="mc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} stroke="#3F4147" strokeDasharray="3 5" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#mc)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={H - pad.b} stroke="#B5BAC1" strokeOpacity="0.35" strokeWidth="1" />
        <circle cx={x(hi)} cy={y(data[hi])} r="4" fill={color} stroke="#2B2D31" strokeWidth="2" />
        <text x={pad.l} y={H - 4} fill="#80848E" fontSize="11">launch</text>
        <text x={W - pad.r} y={H - 4} fill="#80848E" fontSize="11" textAnchor="end">now</text>
      </svg>
    </div>
  );
}
