import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { DiscordPreview, McapChart, RecipientInline, Socials, TxModal, WalletStatus, type TxTarget } from '../components/launch';
import { Avatar, CoinImage, CopyButton, Empty, KV, MonoId, Notice, ServerIcon, Spinner, StatusBadge, cx } from '../components/ui';
import { DCM_PUMP_URL, solscanAccount, solscanTx } from '../lib/fixtures';
import { dateTime, date, shortAddr, sol, solLabel } from '../lib/format';
import { MIN_PAYOUT, isClaimed, launchStatus, payoutDestination, totalsFor } from '../lib/ledger';
import { useApp } from '../lib/store';
import type { Launch, Snapshot } from '../lib/types';

export default function LaunchDetailPage() {
  const { id } = useParams();
  const app = useApp();
  const s = app.data;
  const launch = s.launches.find((l) => l.id === id);
  const [tx, setTx] = useState<TxTarget | null>(null);

  if (!launch && app.status === 'loading')
    return (
      <div className="shell flex items-center justify-center gap-3 py-24 text-ink-mute">
        <Spinner size={20} /> Loading launch…
      </div>
    );

  if (!launch)
    return (
      <div className="shell py-10">
        <Empty
          icon="search"
          title="Launch not found"
          body={<>No launch with ID <span className="mono">{id}</span>.</>}
          action={
            <Link to="/launches" className="btn-primary">
              <Icon name="arrowLeft" size={14} /> Back to launches
            </Link>
          }
        />
      </div>
    );

  const t = totalsFor(s, launch.id);
  const lastPayout = [...s.payouts].filter((p) => p.launchId === launch.id && p.status === 'completed').sort((a, b) => b.at - a.at)[0];

  return (
    <div className="shell">
      <Link to="/launches" className="mb-4 inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-ink-mute hover:text-ink">
        <Icon name="arrowLeft" size={14} /> Back to launches
      </Link>

      <section className="card relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-blurple/20 to-transparent" />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-6">
          <CoinImage src={launch.imageUrl} name={launch.name} size={96} className="!rounded-2xl ring-4 ring-card" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-ink">{launch.name}</h1>
              <span className="mono rounded bg-rail px-2 py-0.5 !text-[13px] text-ink-soft">${launch.ticker}</span>
              <StatusBadge status={launchStatus(s, launch)} />
            </div>
            <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-soft">{launch.description || <span className="text-ink-dim">No description.</span>}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
              <span className="flex items-center gap-1.5 text-ink-mute">
                Mint <MonoId value={launch.mint} />
              </span>
              <a href={`https://pump.fun/coin/${launch.mint}`} target="_blank" rel="noreferrer noopener" className="link inline-flex items-center gap-1">
                pump.fun <Icon name="arrowRight" size={12} className="-rotate-45" />
              </a>
              <a href={solscanAccount(launch.mint)} target="_blank" rel="noreferrer noopener" className="link inline-flex items-center gap-1">
                Solscan <Icon name="arrowRight" size={12} className="-rotate-45" />
              </a>
            </div>
            <div className="mt-3">
              <Socials launch={launch} />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_330px]">
        <div className="grid min-w-0 content-start gap-4">
          <section className="card p-5">
            <McapChart series={launch.mcap} />
          </section>
          <FeeBreakdown data={s} launch={launch} />
          <Ledger data={s} launch={launch} onTx={setTx} />
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-ink">Discord announcement</h2>
              <span className="text-[12px] text-ink-mute">{lastPayout ? 'Latest payout' : 'Next payout'}</span>
            </div>
            <DiscordPreview launch={launch} amount={lastPayout?.amount ?? t.pending} at={lastPayout?.at ?? Date.now()} />
          </section>
        </div>

        <aside className="grid content-start gap-4">
          <PayoutStatus data={s} launch={launch} />
          <RecipientPanel data={s} launch={launch} />
          <Metadata launch={launch} onTx={setTx} />
        </aside>
      </div>
      <TxModal target={tx} onClose={() => setTx(null)} />
    </div>
  );
}

function FeeBreakdown({ data, launch }: { data: Snapshot; launch: Launch }) {
  const t = totalsFor(data, launch.id);
  const paidPct = t.earned ? (t.paid / t.earned) * 100 : 0;
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-ink">Fee breakdown</h2>
        <span className="text-[12px] text-ink-mute">{t.feeCount} fee event{t.feeCount === 1 ? '' : 's'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Box label="Gross fees" value={t.gross} />
        <Box label="Platform 10%" value={t.platform} muted />
        <Box label="Recipient 90%" value={t.earned} />
        <Box label="Paid" value={t.paid} tone="mint" />
        <Box label="Pending" value={t.pending} tone="gold" />
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-[12px] text-ink-mute">
          <span>Recipient share paid</span>
          <span>{paidPct.toFixed(0)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-rail">
          <div className="h-full rounded-full bg-mint transition-[width] duration-500" style={{ width: `${paidPct}%` }} />
        </div>
      </div>
    </section>
  );
}

function Box({ label, value, tone, muted }: { label: string; value: number; tone?: 'mint' | 'gold'; muted?: boolean }) {
  return (
    <div className="inset px-3 py-2.5">
      <div className="kpi !text-[10px]">{label}</div>
      <div className={cx('mt-1 truncate text-[16px] font-bold tabular-nums', tone === 'mint' ? 'text-mint-bright' : tone === 'gold' ? 'text-gold' : muted ? 'text-ink-soft' : 'text-ink')}>{sol(value)}</div>
      <div className="text-[10.5px] text-ink-dim">SOL</div>
    </div>
  );
}

function Ledger({ data, launch, onTx }: { data: Snapshot; launch: Launch; onTx: (r: TxTarget) => void }) {
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    type Row = { at: number; key: string; kind: 'fee' | 'payout' | 'failed'; credit: number; debit: number; gross?: number; platform?: number; open: () => void; balance: number };
    const list: Row[] = [
      ...data.fees.filter((f) => f.launchId === launch.id).map((f) => ({ at: f.at, key: f.id, kind: 'fee' as const, credit: f.recipient, debit: 0, gross: f.gross, platform: f.platform, open: () => onTx({ kind: 'fee', fee: f, launch }), balance: 0 })),
      ...data.payouts.filter((p) => p.launchId === launch.id).map((p) => ({ at: p.at, key: p.id, kind: p.status === 'completed' ? ('payout' as const) : ('failed' as const), credit: 0, debit: p.status === 'completed' ? p.amount : 0, open: () => onTx({ kind: 'payout', payout: p, launch }), balance: 0 })),
    ].sort((a, b) => a.at - b.at || (a.kind === 'fee' ? -1 : 1));
    let bal = 0;
    for (const r of list) {
      bal += r.credit - r.debit;
      r.balance = bal;
    }
    return list.reverse();
  }, [data.fees, data.payouts, launch, onTx]);
  const visible = all ? rows : rows.slice(0, 8);
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <h2 className="text-[15px] font-bold text-ink">Payout ledger</h2>
        <span className="text-[12px] text-ink-mute">{rows.length} entries</span>
      </div>
      {rows.length === 0 ? (
        <div className="border-t border-black/20 px-5 py-8 text-center text-[13px] text-ink-mute">No fees yet. Creator fees appear here as the coin trades.</div>
      ) : (
        <div className="overflow-x-auto border-t border-black/20">
          <table className="w-full min-w-[600px] text-left text-[12.5px]">
            <thead className="text-[10.5px] uppercase tracking-wide text-ink-dim">
              <tr>
                <th className="px-5 py-2 font-bold">When</th>
                <th className="px-3 py-2 font-bold">Entry</th>
                <th className="px-3 py-2 text-right font-bold">Gross</th>
                <th className="px-3 py-2 text-right font-bold">Platform</th>
                <th className="px-3 py-2 text-right font-bold">Recipient ±</th>
                <th className="px-3 py-2 text-right font-bold">Pending</th>
                <th className="px-5 py-2 text-right font-bold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/20 tabular-nums">
              {visible.map((r) => (
                <tr key={r.key} className="hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-5 py-2.5 text-ink-soft">{dateTime(r.at)}</td>
                  <td className="px-3 py-2.5">
                    {r.kind === 'fee' ? <span className="chip bg-blurple/15 text-blurple-light">Fee</span> : r.kind === 'payout' ? <span className="chip bg-mint/15 text-mint-bright">Payout</span> : <span className="chip bg-danger/12 text-[#FF8A8D]">Failed payout</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-ink-body">{r.gross !== undefined ? sol(r.gross) : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-ink-mute">{r.platform !== undefined ? sol(r.platform) : '—'}</td>
                  <td className={cx('px-3 py-2.5 text-right font-semibold', r.credit ? 'text-ink' : r.debit ? 'text-mint-bright' : 'text-ink-dim')}>{r.credit ? `+${sol(r.credit)}` : r.debit ? `−${sol(r.debit)}` : '0'}</td>
                  <td className="px-3 py-2.5 text-right text-gold">{sol(r.balance)}</td>
                  <td className="px-5 py-2.5 text-right">
                    <button type="button" className="link text-[12px]" onClick={r.open}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 8 && (
        <div className="border-t border-black/20 px-5 py-2.5">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            <Icon name="chevronDown" size={14} className={cx('transition-transform', all && 'rotate-180')} />
            {all ? 'Show fewer' : `Show all ${rows.length} entries`}
          </button>
        </div>
      )}
    </section>
  );
}

function PayoutStatus({ data, launch }: { data: Snapshot; launch: Launch }) {
  const t = totalsFor(data, launch.id);
  const unclaimed = launch.recipient.kind === 'server' && !isClaimed(data, launch.recipient.serverId);
  return (
    <section className="card overflow-hidden border-blurple/40">
      <div className="flex items-center justify-between border-b border-black/20 bg-blurple/10 px-4 py-3">
        <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <Icon name="wallet" size={15} className="text-blurple-light" /> Payout status
        </h2>
        <StatusBadge status={launchStatus(data, launch)} />
      </div>
      <div className="grid gap-2 p-4 text-[13px]">
        <div className="flex items-center justify-between">
          <span className="text-ink-mute">Pending for recipient</span>
          <span className="font-bold text-gold">{solLabel(t.pending)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-ink-mute">Paid to date</span>
          <span className="font-bold text-mint-bright">{solLabel(t.paid)}</span>
        </div>
        {unclaimed ? (
          <Notice tone="warn" icon="lock">
            {launch.recipient.kind === 'server' && launch.recipient.serverName} hasn’t claimed its treasury yet. Payouts start once a server admin verifies and links a wallet.
            <div className="mt-2">
              <Link to="/claim" state={{ serverId: launch.recipient.kind === 'server' ? launch.recipient.serverId : undefined }} className="btn-primary btn-sm">
                <Icon name="shield" size={13} /> Claim this server
              </Link>
            </div>
          </Notice>
        ) : launch.failure ? (
          <Notice tone="error">
            <b className="text-ink">Last payout failed</b> {dateTime(launch.failure.at)}. {launch.failure.reason} It will be retried automatically.
          </Notice>
        ) : (
          <p className="text-[12px] text-ink-mute">Payouts are sent automatically once the pending balance reaches {sol(MIN_PAYOUT)} SOL.</p>
        )}
      </div>
    </section>
  );
}

function RecipientPanel({ data, launch }: { data: Snapshot; launch: Launch }) {
  const dest = payoutDestination(data, launch);
  const r = launch.recipient;
  if (r.kind === 'member')
    return (
      <section className="card overflow-hidden">
        <div className="h-12 bg-gradient-to-br from-blurple to-blurple-hover" />
        <div className="px-4 pb-4">
          <div className="-mt-6 inline-flex rounded-full border-4 border-card">
            <Avatar name={r.username} user={r.discordId ? { id: r.discordId, username: r.username } : null} size={48} />
          </div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-mute">Member recipient</div>
          <div className="text-[16px] font-bold text-ink">@{r.username}</div>
          <div className="mt-3 divide-y divide-line/40 rounded-lg bg-deep px-3">
            {r.discordId && <KV k="Discord ID" v={r.discordId} mono />}
            <KV k="Payout wallet" v={dest ? <a className="link mono" href={solscanAccount(dest)} target="_blank" rel="noreferrer noopener">{shortAddr(dest, 5, 5)}</a> : '—'} />
            <KV k="Status" v={<WalletStatus data={data} launch={launch} />} />
          </div>
        </div>
      </section>
    );
  const claim = data.claims[r.serverId];
  return (
    <section className="card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-mute">Server treasury recipient</div>
      <div className="mt-2 flex items-center gap-3">
        <ServerIcon name={r.serverName} iconUrl={r.iconUrl} id={r.serverId} size={44} />
        <div className="min-w-0 truncate text-[16px] font-bold text-ink">{r.serverName}</div>
      </div>
      <div className="mt-3 divide-y divide-line/40 rounded-lg bg-deep px-3">
        <KV k="Server ID" v={r.serverId} mono />
        {r.channel && <KV k="Announcements" v={`#${r.channel}`} />}
        <KV k="Treasury" v={claim ? <span className="text-mint-bright">Claimed</span> : <span className="text-gold">Unclaimed</span>} />
        {claim && <KV k="Treasury wallet" v={<a className="link mono" href={solscanAccount(claim.wallet)} target="_blank" rel="noreferrer noopener">{shortAddr(claim.wallet, 5, 5)}</a>} />}
        {claim && <KV k="Verified admin" v={`@${claim.adminUsername}`} />}
      </div>
    </section>
  );
}

function Metadata({ launch, onTx }: { launch: Launch; onTx: (r: TxTarget) => void }) {
  return (
    <section className="card p-4">
      <h2 className="mb-2 text-[14px] font-bold text-ink">Launch details</h2>
      <div className="divide-y divide-line/40">
        <KV k="Created" v={date(launch.createdAt)} />
        {launch.devUsername && <KV k="Developer" v={`@${launch.devUsername}`} />}
        <KV k="Dev wallet" v={<a className="link mono" href={solscanAccount(launch.devWallet)} target="_blank" rel="noreferrer noopener">{shortAddr(launch.devWallet, 5, 5)}</a>} />
        <KV k="Dev buy" v={solLabel(launch.devBuy)} />
        <KV k="Recipient" v={<RecipientInline launch={launch} size={16} />} />
        <KV k="Payout message" v={launch.payoutMessage || '—'} />
        {launch.signature && <KV k="Launch tx" v={<a className="link mono" href={solscanTx(launch.signature)} target="_blank" rel="noreferrer noopener">{shortAddr(launch.signature, 5, 5)}</a>} />}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        <button type="button" className="btn-ghost btn-sm" onClick={() => onTx({ kind: 'launch', launch })}>
          <Icon name="receipt" size={13} /> All details
        </button>
        <CopyButton value={launch.mint} label="Copy mint" toast="Mint address copied" />
      </div>
      <p className="mt-2 text-[11px] text-ink-dim">
        Trade on <a className="link" href={DCM_PUMP_URL.replace(/[^/]+$/, launch.mint)} target="_blank" rel="noreferrer noopener">pump.fun</a>
      </p>
    </section>
  );
}
