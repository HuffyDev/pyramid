import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { LaunchCard, PayoutTable, TxModal, type TxTarget } from '../components/launch';
import { PageHeader } from '../components/Shell';
import { useToast } from '../components/Toast';
import { useUI } from '../components/UIState';
import { Avatar, Empty, Segmented, ServerIcon, Spinner, cx } from '../components/ui';
import { loginDiscord, refresh } from '../lib/actions';
import { ago, shortAddr, sol, time } from '../lib/format';
import { allTotals } from '../lib/ledger';
import { useApp, useNow } from '../lib/store';
import type { NoticeKind, Snapshot } from '../lib/types';
import { isSolanaAddress } from '../lib/validate';
import { AggregateCards, matchLaunch, sortLaunches, type SortKey } from './Launches';

export default function DashboardPage() {
  const app = useApp();
  const s = app.data;
  const toast = useToast();
  const ui = useUI();
  const connected = app.wallet?.address ?? '';
  const [tab, setTab] = useState<'all' | 'mine'>(connected ? 'mine' : 'all');
  const [lookup, setLookup] = useState(connected);
  const [viewed, setViewed] = useState(connected);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [shown, setShown] = useState(6);
  const [refreshing, setRefreshing] = useState(false);
  const [tx, setTx] = useState<TxTarget | null>(null);

  useEffect(() => {
    if (connected && (!viewed || viewed === lookup)) {
      setViewed(connected);
      setLookup(connected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => setShown(6), [tab, q, sort, viewed]);

  const scope = useMemo(() => (tab === 'all' ? s.launches : s.launches.filter((l) => l.devWallet === viewed)), [s.launches, tab, viewed]);
  const list = useMemo(() => sortLaunches(scope.filter((l) => matchLaunch(l, q)), sort), [scope, q, sort]);
  const ids = useMemo(() => new Set(scope.map((l) => l.id)), [scope]);
  const payouts = useMemo(() => s.payouts.filter((p) => ids.has(p.launchId)).sort((a, b) => b.at - a.at), [s.payouts, ids]);
  const notices = useMemo(() => (tab === 'all' ? s.notices : s.notices.filter((n) => n.launchId && ids.has(n.launchId))), [s.notices, ids, tab]);

  function onLookup(e: FormEvent) {
    e.preventDefault();
    const w = lookup.trim();
    if (!isSolanaAddress(w)) {
      toast.error('Enter a valid Solana wallet address');
      return;
    }
    setViewed(w);
    setTab('mine');
  }

  async function onRefresh() {
    setRefreshing(true);
    const r = await refresh();
    setRefreshing(false);
    if (r.ok) toast.success('Dashboard updated');
    else toast.error('Could not refresh', r.error);
  }

  return (
    <div className="shell">
      <PageHeader
        title="Dashboard"
        sub="Track launches, payouts and treasury balances."
        right={
          <div className="flex items-center gap-3">
            {app.loadedAt && (
              <span className="text-[12px] text-ink-mute">
                Updated <b className="text-ink-soft">{time(app.loadedAt)}</b>
              </span>
            )}
            <button type="button" className="btn-secondary btn-sm" onClick={() => void onRefresh()} disabled={refreshing}>
              {refreshing ? <Spinner size={14} /> : <Icon name="refresh" size={14} />} Refresh
            </button>
          </div>
        }
      />

      <div className="card mb-5 flex flex-col gap-3 p-3 sm:p-4 md:flex-row md:items-center">
        <Segmented label="Launch scope" value={tab} onChange={setTab} options={[{ value: 'all', label: 'All launches' }, { value: 'mine', label: 'My launches' }]} />
        <form onSubmit={onLookup} className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Icon name="wallet" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input className="input mono !pl-9 !text-[13px]" placeholder="Developer wallet address" value={lookup} onChange={(e) => setLookup(e.target.value.trim())} aria-label="Developer wallet" spellCheck={false} />
          </div>
          <button type="submit" className="btn-primary">
            View
          </button>
        </form>
      </div>

      {tab === 'mine' && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-ink-mute">
          {viewed ? (
            <>
              Viewing wallet <span className="mono rounded bg-rail px-1.5 py-0.5">{shortAddr(viewed, 6, 6)}</span>
              {connected && viewed === connected && <span className="chip bg-mint/15 text-mint-bright">You</span>}
              {connected && viewed !== connected && (
                <button type="button" className="link text-[12.5px]" onClick={() => { setViewed(connected); setLookup(connected); }}>
                  Back to my wallet
                </button>
              )}
            </>
          ) : (
            <>
              No wallet selected.{' '}
              <button type="button" className="link" onClick={() => ui.open('connect')}>
                Connect your wallet
              </button>{' '}
              or look one up above.
            </>
          )}
        </div>
      )}

      <AggregateCards data={s} launches={scope} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <h2 className="flex-1 text-[17px] font-bold text-ink">
              {tab === 'all' ? 'All launches' : 'My launches'} <span className="text-[13px] font-medium text-ink-mute">({list.length})</span>
            </h2>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-mute" />
                <input type="search" className="input !py-1.5 !pl-8 !text-[13px] sm:!w-48" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search dashboard launches" />
              </div>
              <select className="input !w-auto !py-1.5 !text-[13px]" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="mcap">Market cap</option>
              </select>
            </div>
          </div>

          {app.status === 'loading' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="skeleton h-[188px] rounded-xl" />
              ))}
            </div>
          ) : app.status === 'error' ? (
            <Empty icon="alert" title="Couldn’t load data" body={app.error ?? 'Please try again.'} action={<button type="button" className="btn-primary btn-sm" onClick={() => void onRefresh()}>Retry</button>} />
          ) : list.length === 0 ? (
            tab === 'mine' && !viewed ? (
              <Empty icon="wallet" title="Connect your wallet" body="Connect your wallet or enter a developer wallet above to see its launches." action={<button type="button" className="btn-primary btn-sm" onClick={() => ui.open('connect')}>Connect</button>} />
            ) : scope.length === 0 ? (
              <Empty icon="rocket" title={tab === 'mine' ? 'No launches from this wallet yet' : 'No launches yet'} body="Launched coins will show up here." action={<Link to="/" className="btn-primary btn-sm">Launch a coin</Link>} />
            ) : (
              <Empty title="No launches match your search" action={<button type="button" className="btn-secondary btn-sm" onClick={() => setQ('')}>Clear search</button>} />
            )
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.slice(0, shown).map((l) => (
                  <LaunchCard key={l.id} data={s} launch={l} />
                ))}
              </div>
              {shown < list.length && (
                <div className="mt-4 flex justify-center">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setShown((n) => n + 6)}>
                    Load more ({list.length - shown})
                  </button>
                </div>
              )}
            </>
          )}

          <section className="card mt-6 overflow-hidden">
            <div className="flex items-center justify-between px-5 pb-3 pt-4">
              <h2 className="text-[15px] font-bold text-ink">Payout history</h2>
              <span className="text-[12px] text-ink-mute">{payouts.length} records</span>
            </div>
            <PayoutTable payouts={payouts.slice(0, 10)} onTx={setTx} launchOf={(id) => s.launches.find((l) => l.id === id)} />
          </section>
        </div>

        <aside className="grid content-start gap-4">
          <MyServers />
          <TreasuryTable data={s} />
          <Feed notices={notices} />
        </aside>
      </div>
      <TxModal target={tx} onClose={() => setTx(null)} />
    </div>
  );
}

function treasuries(data: Snapshot) {
  const totals = allTotals(data);
  const out = new Map<string, { name: string; iconUrl?: string; pending: number; paid: number; launches: number }>();
  for (const c of Object.values(data.claims)) out.set(c.serverId, { name: c.serverName, iconUrl: c.iconUrl, pending: 0, paid: 0, launches: 0 });
  for (const l of data.launches) {
    if (l.recipient.kind !== 'server') continue;
    const t = totals.get(l.id)!;
    const row = out.get(l.recipient.serverId) ?? { name: l.recipient.serverName, iconUrl: l.recipient.iconUrl, pending: 0, paid: 0, launches: 0 };
    row.pending += t.pending;
    row.paid += t.paid;
    row.launches++;
    out.set(l.recipient.serverId, row);
  }
  return out;
}

function MyServers() {
  const app = useApp();
  const toast = useToast();
  const loc = useLocation();
  const me = app.discord;
  const rows = treasuries(app.data);
  const managed = me?.guilds.filter((g) => g.canManage) ?? [];
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[14px] font-bold text-ink">Your servers</h2>
        {me && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-mute">
            <Avatar user={me.user} size={16} /> @{me.user.username}
          </span>
        )}
      </div>
      {!me ? (
        <div className="rounded-lg bg-deep p-4 text-center text-[13px] text-ink-mute">
          Log in with Discord to see servers you manage.
          <button
            type="button"
            className="btn-primary btn-sm mt-3 w-full"
            onClick={() => {
              const r = loginDiscord(loc.pathname);
              if (!r.ok) toast.error('Discord login unavailable', r.error);
            }}
          >
            Log in with Discord
          </button>
        </div>
      ) : managed.length === 0 ? (
        <div className="rounded-lg bg-deep p-4 text-[13px] text-ink-mute">You don’t manage any servers. Server owners and members with Manage Server can claim treasuries.</div>
      ) : (
        <ul className="grid max-h-[320px] gap-2 overflow-y-auto">
          {managed.map((g) => {
            const claim = app.data.claims[g.id];
            const r = rows.get(g.id);
            return (
              <li key={g.id} className="flex items-center gap-3 rounded-lg bg-deep p-2.5">
                <ServerIcon name={g.name} iconUrl={g.iconUrl} id={g.id} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-ink">{g.name}</div>
                  <div className="text-[11.5px] text-ink-mute">
                    {claim ? <span className="text-mint-bright">Claimed</span> : <span className="text-gold">Unclaimed</span>} · {sol(r?.pending ?? 0, 3)} SOL pending
                  </div>
                </div>
                <Link to="/claim" state={{ serverId: g.id }} className="btn-ghost btn-sm !px-2" aria-label={`Manage ${g.name}`}>
                  <Icon name="chevronRight" size={15} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TreasuryTable({ data }: { data: Snapshot }) {
  const rows = [...treasuries(data).entries()].sort((a, b) => b[1].pending - a[1].pending);
  return (
    <section className="card p-4">
      <h2 className="mb-1 text-[14px] font-bold text-ink">Server treasuries</h2>
      <p className="mb-3 text-[12px] text-ink-mute">Treasury share waiting for payout.</p>
      {rows.length === 0 ? (
        <p className="rounded-lg bg-deep p-3 text-center text-[12.5px] text-ink-mute">No server treasuries yet.</p>
      ) : (
        <ul className="divide-y divide-line/40">
          {rows.slice(0, 10).map(([id, r]) => (
            <li key={id} className="flex items-center gap-2.5 py-2">
              <ServerIcon name={r.name} iconUrl={r.iconUrl} id={id} size={24} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-body">{r.name}</span>
              {!data.claims[id] && <Icon name="lock" size={12} className="text-gold" aria-label="Unclaimed" />}
              <span className={cx('text-[13px] font-semibold tabular-nums', r.pending > 0 ? 'text-gold' : 'text-ink-dim')}>{sol(r.pending, 3)}</span>
            </li>
          ))}
        </ul>
      )}
      <Link to="/claim" className="link mt-2 inline-block text-[12px]">
        Claim a server treasury →
      </Link>
    </section>
  );
}

const FEED_ICON: Record<NoticeKind, [IconName, string]> = {
  launch: ['rocket', 'bg-blurple/20 text-blurple-light'],
  fees: ['trend', 'bg-link/15 text-link'],
  payout: ['check', 'bg-mint/15 text-mint-bright'],
  failure: ['alert', 'bg-danger/15 text-[#FF8A8D]'],
  claim: ['shield', 'bg-gold/15 text-gold'],
  offer: ['megaphone', 'bg-fuchsia/15 text-[#F68BC4]'],
  buyback: ['flame', 'bg-fuchsia/15 text-[#F68BC4]'],
};

function Feed({ notices }: { notices: Snapshot['notices'] }) {
  const [n, setN] = useState(8);
  const now = useNow();
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <Icon name="bell" size={14} /> Activity
        </h2>
      </div>
      {notices.length === 0 ? (
        <p className="rounded-lg bg-deep p-4 text-center text-[13px] text-ink-mute">No activity yet.</p>
      ) : (
        <ul className="grid gap-1">
          {notices.slice(0, n).map((x) => {
            const [icon, tone] = FEED_ICON[x.kind] ?? FEED_ICON.launch;
            const body = (
              <>
                <span className={cx('mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full', tone)}>
                  <Icon name={icon} size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium leading-snug text-ink-body">{x.title}</span>
                  <span className="block truncate text-[11.5px] text-ink-mute">{x.body}</span>
                  <span className="block text-[10.5px] text-ink-dim">{ago(x.at, now)}</span>
                </span>
              </>
            );
            return (
              <li key={x.id}>
                {x.launchId ? (
                  <Link to={`/launches/${x.launchId}`} className="flex gap-2.5 rounded-md p-1.5 hover:bg-hover">
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-2.5 p-1.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {notices.length > n && (
        <button type="button" className="btn-ghost btn-sm mt-2 w-full" onClick={() => setN((v) => v + 8)}>
          Show more
        </button>
      )}
    </section>
  );
}
