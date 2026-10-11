import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { DiscordPreview, McapChart, ReceiptModal, RecipientInline, Socials, WalletStatus, launchReceiptId, type ReceiptTarget } from '../components/launch';
import { useToast } from '../components/Toast';
import { Avatar, CoinArt, CopyButton, Empty, KV, MonoId, Notice, SampleTag, ServerIcon, Spinner, StatusBadge, cx } from '../components/ui';
import { generateFees, simulateFailure, simulatePayout } from '../lib/actions';
import { serverById, userById } from '../lib/fixtures';
import { dateTime, date, shortAddr, sol, solLabel } from '../lib/format';
import { MIN_PAYOUT, canPayout, isClaimed, launchStatus, payoutDestination, totalsFor } from '../lib/ledger';
import { useDemo } from '../lib/store';
import type { DemoState, Launch } from '../lib/types';

export default function LaunchDetailPage() {
  const { id } = useParams();
  const s = useDemo();
  const launch = s.launches.find((l) => l.id === id);
  const [receipt, setReceipt] = useState<ReceiptTarget | null>(null);

  if (!launch)
    return (
      <div className="shell py-10">
        <Empty
          icon="search"
          title="Launch not found"
          body={<>No demo launch with ID <span className="mono">{id}</span>. It may have been removed by a demo reset.</>}
          action={
            <Link to="/launches" className="btn-primary">
              <Icon name="arrowLeft" size={14} /> Back to launches
            </Link>
          }
        />
      </div>
    );

  const t = totalsFor(s, launch.id);
  const status = launchStatus(s, launch);
  const lastPayout = [...s.payouts].filter((p) => p.launchId === launch.id && p.status === 'completed').sort((a, b) => b.at - a.at)[0];

  return (
    <div className="shell">
      <Link to="/launches" className="mb-4 inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-ink-mute hover:text-ink">
        <Icon name="arrowLeft" size={14} /> Back to launches
      </Link>

      {/* Identity */}
      <section className="card relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-blurple/20 to-transparent" />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-6">
          <CoinArt image={launch.image} size={96} label={launch.name} className="!rounded-2xl ring-4 ring-card" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-ink">{launch.name}</h1>
              <span className="mono rounded bg-rail px-2 py-0.5 !text-[13px] text-ink-soft">${launch.ticker}</span>
              <StatusBadge status={status} />
              <SampleTag sample={launch.sample} />
            </div>
            <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-soft">{launch.description || <span className="text-ink-dim">No description.</span>}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
              <span className="flex items-center gap-1.5 text-ink-mute">
                Launch ID <MonoId value={launch.id} />
              </span>
              <span className="flex items-center gap-1.5 text-ink-mute">
                Demo mint <MonoId value={launch.mint} />
              </span>
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

          <FeeBreakdown state={s} launch={launch} />

          <Ledger state={s} launch={launch} onReceipt={setReceipt} />

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-ink">Discord notification preview</h2>
              <span className="text-[12px] text-ink-mute">Fictional server &amp; bot</span>
            </div>
            <DiscordPreview launch={launch} amount={lastPayout?.amount ?? t.pending} at={lastPayout?.at ?? s.now} />
            <p className="mt-2 text-[12px] text-ink-mute">DiscordMoney does not post to Discord in this demo. This is how a payout update could look.</p>
          </section>
        </div>

        <aside className="grid content-start gap-4">
          <DemoControls state={s} launch={launch} />
          <RecipientPanel state={s} launch={launch} />
          <Metadata state={s} launch={launch} onReceipt={setReceipt} />
        </aside>
      </div>
      <ReceiptModal target={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

function FeeBreakdown({ state, launch }: { state: DemoState; launch: Launch }) {
  const t = totalsFor(state, launch.id);
  const paidPct = t.earned ? (t.paid / t.earned) * 100 : 0;
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-ink">Fee breakdown</h2>
        <span className="text-[12px] text-ink-mute">{t.feeCount} fee events · lamport-exact</span>
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
      <div className={cx('mt-1 truncate text-[16px] font-bold tabular-nums', tone === 'mint' ? 'text-mint-bright' : tone === 'gold' ? 'text-gold' : muted ? 'text-ink-soft' : 'text-ink')}>
        {sol(value)}
      </div>
      <div className="text-[10.5px] text-ink-dim">SOL</div>
    </div>
  );
}

function Ledger({ state, launch, onReceipt }: { state: DemoState; launch: Launch; onReceipt: (r: ReceiptTarget) => void }) {
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    type Row = { at: number; key: string; kind: 'fee' | 'payout' | 'failed'; credit: number; debit: number; gross?: number; platform?: number; sample: boolean; open: () => void; balance: number };
    const fees = state.fees.filter((f) => f.launchId === launch.id);
    const pays = state.payouts.filter((p) => p.launchId === launch.id);
    const list: Row[] = [
      ...fees.map((f) => ({ at: f.at, key: f.id, kind: 'fee' as const, credit: f.recipient, debit: 0, gross: f.gross, platform: f.platform, sample: f.sample, open: () => onReceipt({ kind: 'fee', fee: f, launch }), balance: 0 })),
      ...pays.map((p) => ({ at: p.at, key: p.id, kind: p.status === 'completed' ? ('payout' as const) : ('failed' as const), credit: 0, debit: p.status === 'completed' ? p.amount : 0, sample: p.sample, open: () => onReceipt({ kind: 'payout', payout: p, launch }), balance: 0 })),
    ].sort((a, b) => a.at - b.at || (a.kind === 'fee' ? -1 : 1));
    let bal = 0;
    for (const r of list) {
      bal += r.credit - r.debit;
      r.balance = bal;
    }
    return list.reverse();
  }, [state.fees, state.payouts, launch, onReceipt]);
  const visible = all ? rows : rows.slice(0, 8);
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <h2 className="text-[15px] font-bold text-ink">Payout ledger</h2>
        <span className="text-[12px] text-ink-mute">{rows.length} entries</span>
      </div>
      {rows.length === 0 ? (
        <div className="border-t border-black/20 px-5 py-8 text-center text-[13px] text-ink-mute">No fee events yet. Use “Generate sample fees” in demo controls.</div>
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
                <th className="px-5 py-2 text-right font-bold">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/20 tabular-nums">
              {visible.map((r) => (
                <tr key={r.key} className="hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-5 py-2.5 text-ink-soft">{dateTime(r.at)}</td>
                  <td className="px-3 py-2.5">
                    {r.kind === 'fee' ? (
                      <span className="chip bg-blurple/15 text-blurple-light">Fee event</span>
                    ) : r.kind === 'payout' ? (
                      <span className="chip bg-mint/15 text-mint-bright">Payout</span>
                    ) : (
                      <span className="chip bg-danger/12 text-[#FF8A8D]">Failed attempt</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-ink-body">{r.gross !== undefined ? sol(r.gross) : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-ink-mute">{r.platform !== undefined ? sol(r.platform) : '—'}</td>
                  <td className={cx('px-3 py-2.5 text-right font-semibold', r.credit ? 'text-ink' : r.debit ? 'text-mint-bright' : 'text-ink-dim')}>
                    {r.credit ? `+${sol(r.credit)}` : r.debit ? `−${sol(r.debit)}` : '0'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gold">{sol(r.balance)}</td>
                  <td className="px-5 py-2.5 text-right">
                    <button type="button" className="link text-[12px]" onClick={r.open}>
                      {r.sample ? 'Sample' : 'Demo'}
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

function DemoControls({ state, launch }: { state: DemoState; launch: Launch }) {
  const toast = useToast();
  const [busy, setBusy] = useState<null | 'fees' | 'pay' | 'fail'>(null);
  const lock = useRef(false);
  const check = canPayout(state, launch);
  const t = totalsFor(state, launch.id);

  const act = (kind: 'fees' | 'pay' | 'fail') => {
    if (lock.current) return;
    lock.current = true;
    setBusy(kind);
    window.setTimeout(() => {
      if (kind === 'fees') {
        const r = generateFees(launch.id);
        if (r.ok) toast.success(`+${sol(r.value.gross)} SOL sample fees`, `${sol(r.value.recipient)} SOL to recipient · ${sol(r.value.platform)} SOL platform`);
        else toast.error('Could not generate fees', r.error);
      } else if (kind === 'pay') {
        const r = simulatePayout(launch.id);
        if (r.ok) toast.success(`Paid ${sol(r.value.amount)} SOL (simulated)`, `Demo receipt ${r.value.receipt}`);
        else toast.error('Payout blocked', r.error);
      } else {
        const r = simulateFailure(launch.id);
        if (r.ok) toast.error('Simulated payout failure', 'No funds moved. Pending balance unchanged — retry anytime.');
        else toast.error('Cannot simulate failure', r.error);
      }
      lock.current = false;
      setBusy(null);
    }, 450);
  };

  return (
    <section className="card overflow-hidden border-blurple/40">
      <div className="flex items-center justify-between border-b border-black/20 bg-blurple/10 px-4 py-3">
        <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <Icon name="zap" size={15} className="text-blurple-light" /> Demo controls
        </h2>
        <span className="chip bg-blurple text-[10px] uppercase text-white">Simulated</span>
      </div>
      <div className="grid gap-2 p-4">
        <div className="mb-1 flex items-center justify-between text-[12.5px]">
          <span className="text-ink-mute">Pending for recipient</span>
          <span className="font-bold text-gold">{solLabel(t.pending)}</span>
        </div>
        <button type="button" className="btn-secondary w-full justify-start" disabled={busy !== null} onClick={() => act('fees')}>
          {busy === 'fees' ? <Spinner size={15} /> : <Icon name="plus" size={15} />} Generate sample fees
        </button>
        <button type="button" className="btn-success w-full justify-start" disabled={busy !== null || !check.ok} onClick={() => act('pay')}>
          {busy === 'pay' ? <Spinner size={15} /> : <Icon name="wallet" size={15} />} Simulate payout{check.ok ? ` · ${sol(t.pending, 3)} SOL` : ''}
        </button>
        <button type="button" className="btn-outline w-full justify-start !text-[#FF8A8D] hover:!border-danger/60" disabled={busy !== null || !check.ok} onClick={() => act('fail')}>
          {busy === 'fail' ? <Spinner size={15} /> : <Icon name="alert" size={15} />} Simulate failure
        </button>
        {!check.ok && (
          <div className="mt-1">
            <Notice tone={check.claim ? 'warn' : 'info'} icon={check.claim ? 'lock' : 'info'}>
              {check.reason}
              {check.claim && (
                <div className="mt-2">
                  <Link to="/claim" state={{ serverId: launch.recipient.kind === 'server' ? launch.recipient.serverId : undefined }} className="btn-primary btn-sm">
                    <Icon name="shield" size={13} /> Go to Claim
                  </Link>
                </div>
              )}
            </Notice>
          </div>
        )}
        {launch.failure && (
          <Notice tone="error">
            <b className="text-ink">Last payout attempt failed</b> {dateTime(launch.failure.at)}. {launch.failure.reason}
          </Notice>
        )}
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-dim">
          Each fee event splits exactly: platform = floor(gross ÷ 10), recipient = remainder. Payouts move the full pending balance once (min {sol(MIN_PAYOUT)} SOL).
        </p>
      </div>
    </section>
  );
}

function RecipientPanel({ state, launch }: { state: DemoState; launch: Launch }) {
  const dest = payoutDestination(state, launch);
  if (launch.recipient.kind === 'member') {
    const u = userById(launch.recipient.userId);
    return (
      <section className="card overflow-hidden">
        <div className="h-12" style={{ background: `linear-gradient(135deg, ${u?.color}, #4752C4)` }} />
        <div className="px-4 pb-4">
          <div className="-mt-6 inline-flex rounded-full border-4 border-card">
            <Avatar user={u} size={48} status />
          </div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-mute">Member recipient</div>
          <div className="text-[16px] font-bold text-ink">{u?.displayName}</div>
          <div className="text-[13px] text-ink-soft">@{u?.username}</div>
          <div className="mt-3 divide-y divide-line/40 rounded-lg bg-deep px-3">
            <KV k="Discord ID" v={u?.discordId} mono />
            <KV k="Linked demo wallet" v={dest ? shortAddr(dest, 5, 5) : '—'} mono />
            <KV k="Status" v={<WalletStatus state={state} launch={launch} />} />
          </div>
        </div>
      </section>
    );
  }
  const sv = serverById(launch.recipient.serverId);
  const claim = state.claims[launch.recipient.serverId];
  return (
    <section className="card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-mute">Server treasury recipient</div>
      <div className="mt-2 flex items-center gap-3">
        <ServerIcon server={sv} size={44} />
        <div className="min-w-0">
          <div className="truncate text-[16px] font-bold text-ink">{sv?.name}</div>
          <div className="text-[12.5px] text-ink-mute">{sv?.members.toLocaleString('en-US')} fictional members</div>
        </div>
      </div>
      <div className="mt-3 divide-y divide-line/40 rounded-lg bg-deep px-3">
        <KV k="Server ID" v={sv?.discordId} mono />
        <KV k="Announcements" v={`#${sv?.announcementChannel}`} />
        <KV k="Treasury" v={claim ? <span className="text-mint-bright">Claimed</span> : <span className="text-gold">Unclaimed</span>} />
        {claim && <KV k="Treasury wallet" v={shortAddr(claim.wallet, 5, 5)} mono />}
        {claim && <KV k="Verified admin" v={`@${userById(claim.adminId)?.username}`} />}
      </div>
      {!isClaimed(state, launch.recipient.serverId) && (
        <Link to="/claim" state={{ serverId: sv?.id }} className="btn-primary btn-sm mt-3 w-full">
          <Icon name="shield" size={13} /> Claim this server
        </Link>
      )}
    </section>
  );
}

function Metadata({ state, launch, onReceipt }: { state: DemoState; launch: Launch; onReceipt: (r: ReceiptTarget) => void }) {
  const [open, setOpen] = useState(false);
  const dev = userById(launch.devUserId);
  const rid = launchReceiptId(launch);
  return (
    <section className="card p-4">
      <h2 className="mb-2 text-[14px] font-bold text-ink">Launch metadata</h2>
      <div className="divide-y divide-line/40">
        <KV k="Created" v={date(launch.createdAt)} />
        <KV k="Developer" v={<span className="inline-flex items-center gap-1.5"><Avatar user={dev} size={16} />@{dev?.username}</span>} />
        <KV k="Dev wallet" v={shortAddr(launch.devWallet, 5, 5)} mono />
        <KV k="Demo dev buy" v={solLabel(launch.devBuy)} />
        <KV k="Recipient" v={<RecipientInline launch={launch} size={16} />} />
        <KV k="Payout message" v={launch.payoutMessage || '—'} />
        <KV k="Data" v={launch.sample ? 'Sample data' : 'Created in your demo'} />
      </div>
      <div className="mt-3 rounded-lg border border-line/50">
        <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-[13px] font-medium text-ink-body hover:bg-hover" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="inline-flex items-center gap-2">
            <Icon name="receipt" size={14} /> Launch receipt details
          </span>
          <Icon name="chevronDown" size={14} className={cx('transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="border-t border-line/50 px-3 py-2 text-[12.5px]">
            <KV k="Receipt" v={<MonoId value={rid} />} />
            <KV k="Demo mint" v={<MonoId value={launch.mint} />} />
            <KV k="Timestamp" v={dateTime(launch.createdAt)} />
            <KV k="Broadcast" v="Not broadcast (demo)" />
            <button type="button" className="link mt-1 text-[12px]" onClick={() => onReceipt({ kind: 'launch', launch })}>
              Open full receipt
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        <CopyButton value={launch.id} label="Copy launch ID" toast="Launch ID copied" />
        <CopyButton value={launch.mint} label="Copy demo mint" toast="Demo mint ID copied" />
      </div>
      <p className="mt-2 text-[11px] text-ink-dim">Demo clock: {dateTime(state.now)}</p>
    </section>
  );
}
