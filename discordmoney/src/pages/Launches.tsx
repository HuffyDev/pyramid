import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LaunchRow, TxModal, type TxTarget } from '../components/launch';
import { PageHeader } from '../components/Shell';
import { Empty, Stat, cx } from '../components/ui';
import { refresh } from '../lib/actions';
import { int, sol } from '../lib/format';
import { STATUS_LABEL, aggregate, latestMcap, launchStatus, platformTotals, type LaunchStatus } from '../lib/ledger';
import { useApp } from '../lib/store';
import type { Launch, Snapshot } from '../lib/types';

export type SortKey = 'newest' | 'oldest' | 'mcap';
const PAGE = 6;

export function matchLaunch(l: Launch, q: string) {
  if (!q) return true;
  const needle = q.toLowerCase().replace(/^\$/, '');
  const recipient = l.recipient.kind === 'member' ? l.recipient.username : l.recipient.serverName;
  return [l.name, l.ticker, recipient, l.devUsername, l.devWallet, l.mint].some((x) => x?.toLowerCase().includes(needle));
}

export function sortLaunches(xs: Launch[], key: SortKey) {
  const arr = [...xs];
  if (key === 'newest') arr.sort((a, b) => b.createdAt - a.createdAt);
  else if (key === 'oldest') arr.sort((a, b) => a.createdAt - b.createdAt);
  else arr.sort((a, b) => latestMcap(b) - latestMcap(a));
  return arr;
}

export function AggregateCards({ data, launches }: { data: Snapshot; launches?: Launch[] }) {
  const a = aggregate(data, launches);
  const p = platformTotals(data);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Stat label="Launches" value={int(a.launches)} icon="rocket" sub="coins launched" />
      <Stat label="Fees generated" value={<>{sol(a.gross, 2)}<span className="ml-1 text-[13px] text-ink-mute">SOL</span></>} icon="trend" sub="gross creator fees" />
      <Stat label="Recipient payouts" value={<>{sol(a.paid, 2)}<span className="ml-1 text-[13px] text-ink-mute">SOL</span></>} icon="check" accent="mint" sub="paid out" />
      <Stat label="Pending payouts" value={<>{sol(a.pending, 2)}<span className="ml-1 text-[13px] text-ink-mute">SOL</span></>} icon="clock" accent="gold" sub="earned, not yet paid" />
      <Stat label="Platform revenue" value={<>{sol(a.platform, 2)}<span className="ml-1 text-[13px] text-ink-mute">SOL</span></>} icon="coins" sub="10% floor share" />
      <Stat label="$DP burned" value={int(p.burned)} icon="flame" accent="fuchsia" sub="via buybacks" />
    </div>
  );
}

export default function LaunchesPage() {
  const app = useApp();
  const s = app.data;
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const sort = (params.get('sort') as SortKey) || 'newest';
  const status = (params.get('status') as LaunchStatus | 'all') || 'all';
  const [shown, setShown] = useState(PAGE);
  const [tx, setTx] = useState<TxTarget | null>(null);

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
        sub="Every launch, its fee split and payout state."
        right={
          <Link to="/" className="btn-primary">
            <Icon name="plus" size={15} /> Launch a coin
          </Link>
        }
      />
      <AggregateCards data={s} />

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
      </div>

      {app.status === 'loading' ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[180px] rounded-xl" />
          ))}
        </div>
      ) : app.status === 'error' ? (
        <Empty icon="alert" title="Couldn’t load launches" body={app.error ?? 'Please try again.'} action={<button type="button" className="btn-primary" onClick={() => void refresh()}>Retry</button>} />
      ) : s.launches.length === 0 ? (
        <Empty icon="rocket" title="No launches yet" body="Launched coins will appear here." action={<Link to="/" className="btn-primary">Launch a coin</Link>} />
      ) : filtered.length === 0 ? (
        <Empty
          title="No launches match"
          body={q ? <>Nothing matches “{q}”{status !== 'all' ? ` with status ${STATUS_LABEL[status as LaunchStatus]}` : ''}. Try a different name, ticker, username or server.</> : 'No launches have this status right now.'}
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
            <LaunchRow key={l.id} data={s} launch={l} onTx={setTx} />
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
      <TxModal target={tx} onClose={() => setTx(null)} />
    </div>
  );
}
