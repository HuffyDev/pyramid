import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LaunchRow, ReceiptModal, type ReceiptTarget } from '../components/launch';
import { PageHeader } from '../components/Shell';
import { Empty, Stat, cx } from '../components/ui';
import { serverById, userById } from '../lib/fixtures';
import { int, sol } from '../lib/format';
import { STATUS_LABEL, aggregate, latestMcap, launchStatus, platformTotals, type LaunchStatus } from '../lib/ledger';
import { useDemo } from '../lib/store';
import type { DemoState, Launch } from '../lib/types';

export type SortKey = 'newest' | 'oldest' | 'mcap';
const PAGE = 6;

export function matchLaunch(l: Launch, q: string) {
  if (!q) return true;
  const needle = q.toLowerCase().replace(/^\$/, '');
  const recipient = l.recipient.kind === 'member' ? userById(l.recipient.userId)?.username : serverById(l.recipient.serverId)?.name;
  const dev = userById(l.devUserId)?.username;
  return [l.name, l.ticker, recipient, dev].some((x) => x?.toLowerCase().includes(needle));
}

export function sortLaunches(xs: Launch[], key: SortKey) {
  const arr = [...xs];
  if (key === 'newest') arr.sort((a, b) => b.createdAt - a.createdAt);
  else if (key === 'oldest') arr.sort((a, b) => a.createdAt - b.createdAt);
  else arr.sort((a, b) => latestMcap(b) - latestMcap(a));
  return arr;
}

export function AggregateCards({ state, launches }: { state: DemoState; launches?: Launch[] }) {
  const a = aggregate(state, launches);
  const p = platformTotals(state);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Stat label="Launches" value={int(a.launches)} icon="rocket" sub="in the demo ledger" />
      <Stat label="Fees generated" value={<>{sol(a.gross, 2)}<span className="ml-1 text-[13px] text-ink-mute">SOL</span></>} icon="trend" sub="gross creator fees" />
      <Stat label="Recipient payouts" value={<>{sol(a.paid, 2)}<span className="ml-1 text-[13px] text-ink-mute">SOL</span></>} icon="check" accent="mint" sub="paid out" />
      <Stat label="Pending payouts" value={<>{sol(a.pending, 2)}<span className="ml-1 text-[13px] text-ink-mute">SOL</span></>} icon="clock" accent="gold" sub="earned, not yet paid" />
      <Stat label="Platform revenue" value={<>{sol(a.platform, 2)}<span className="ml-1 text-[13px] text-ink-mute">SOL</span></>} icon="coins" sub="10% floor share" />
      <Stat label="Demo tokens burned" value={int(p.burned)} icon="flame" accent="fuchsia" sub="sample $DCM" />
    </div>
  );
}

export default function LaunchesPage() {
  const s = useDemo();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const sort = (params.get('sort') as SortKey) || 'newest';
  const status = (params.get('status') as LaunchStatus | 'all') || 'all';
  const [shown, setShown] = useState(PAGE);
  const [receipt, setReceipt] = useState<ReceiptTarget | null>(null);

  const update = (k: string, v: string, def: string) => {
    const next = new URLSearchParams(params);
    if (!v || v === def) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  useEffect(() => setShown(PAGE), [q, sort, status]);

  const filtered = useMemo(() => {
    const xs = s.launches.filter((l) => matchLaunch(l, q) && (status === 'all' || launchStatus(s, l) === status));
    return sortLaunches(xs, sort);
  }, [s, q, sort, status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of s.launches) c[launchStatus(s, l)] = (c[launchStatus(s, l)] ?? 0) + 1;
    return c;
  }, [s]);

  const filtersActive = q !== '' || status !== 'all' || sort !== 'newest';

  return (
    <div className="shell">
      <PageHeader
        title="All launches."
        sub="Every demo launch, its fee split and payout state — calculated from one shared ledger."
        right={
          <Link to="/" className="btn-primary">
            <Icon name="plus" size={15} /> Launch a coin
          </Link>
        }
      />
      <AggregateCards state={s} />

      <div className="card mt-6 flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
          <input
            type="search"
            className="input !pl-9"
            placeholder="Search name, ticker, member or server"
            value={q}
            onChange={(e) => update('q', e.target.value, '')}
            aria-label="Search launches"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <select className="input !py-2 sm:!w-44" value={status} onChange={(e) => update('status', e.target.value, 'all')} aria-label="Filter by status">
            <option value="all">All statuses ({s.launches.length})</option>
            {(Object.keys(STATUS_LABEL) as LaunchStatus[]).map((k) => (
              <option key={k} value={k}>
                {STATUS_LABEL[k]} ({counts[k] ?? 0})
              </option>
            ))}
          </select>
          <select className="input !py-2 sm:!w-40" value={sort} onChange={(e) => update('sort', e.target.value, 'newest')} aria-label="Sort launches">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="mcap">Market cap</option>
          </select>
          <button type="button" className={cx('btn-ghost btn-sm col-span-2 sm:col-span-1', !filtersActive && 'invisible')} onClick={() => setParams({}, { replace: true })} disabled={!filtersActive}>
            <Icon name="x" size={14} /> Clear filters
          </button>
        </div>
      </div>

      <div className="mb-3 mt-5 flex items-center justify-between text-[13px] text-ink-mute" aria-live="polite">
        <span>
          Showing <b className="text-ink-body">{Math.min(shown, filtered.length)}</b> of <b className="text-ink-body">{filtered.length}</b> result{filtered.length === 1 ? '' : 's'}
          {filtered.length !== s.launches.length && <> · {s.launches.length} total</>}
        </span>
        <span className="hidden sm:inline">Sample data is labelled on each card</span>
      </div>

      {filtered.length === 0 ? (
        <Empty
          title="No launches match"
          body={q ? <>Nothing matches “{q}”{status !== 'all' ? ` with status ${STATUS_LABEL[status as LaunchStatus]}` : ''}. Try a ticker like GCAT or a server like Pixel Forge.</> : 'No launches have this status right now.'}
          action={
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => setParams({}, { replace: true })}>
                Clear filters
              </button>
              <Link to="/" className="btn-primary">
                Launch a coin
              </Link>
            </div>
          }
        />
      ) : (
        <div className="grid gap-3">
          {filtered.slice(0, shown).map((l) => (
            <LaunchRow key={l.id} state={s} launch={l} onReceipt={setReceipt} />
          ))}
        </div>
      )}

      {shown < filtered.length && (
        <div className="mt-5 flex justify-center">
          <button type="button" className="btn-secondary" onClick={() => setShown((n) => n + PAGE)}>
            Load more ({filtered.length - shown} remaining)
          </button>
        </div>
      )}
      <ReceiptModal target={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
