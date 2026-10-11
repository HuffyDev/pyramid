import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { LaunchCard, PayoutTable, ReceiptModal, type ReceiptTarget } from '../components/launch';
import { PageHeader } from '../components/Shell';
import { useToast } from '../components/Toast';
import { useUI } from '../components/UIState';
import { Avatar, Empty, Segmented, ServerIcon, Spinner, cx } from '../components/ui';
import { SERVERS, USERS, userById, userByWallet } from '../lib/fixtures';
import { ago, shortAddr, sol, time } from '../lib/format';
import { allTotals } from '../lib/ledger';
import { reloadFromStorage, useDemo } from '../lib/store';
import type { DemoState, NoticeKind } from '../lib/types';
import { AggregateCards, matchLaunch, sortLaunches, type SortKey } from './Launches';

export default function DashboardPage() {
  const s = useDemo();
  const toast = useToast();
  const ui = useUI();
  const connected = userById(s.session.walletUserId);
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [lookup, setLookup] = useState(connected?.wallet ?? '');
  const [viewed, setViewed] = useState<string>(connected?.wallet ?? '');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [shown, setShown] = useState(6);
  const [refreshing, setRefreshing] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptTarget | null>(null);

  // Follow the connected wallet unless the user has looked up another one.
  useEffect(() => {
    if (connected && (!viewed || viewed === lookup)) {
      setViewed(connected.wallet);
      setLookup(connected.wallet);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected?.wallet]);

  useEffect(() => setShown(6), [tab, q, sort, viewed]);

  const scope = useMemo(() => (tab === 'all' ? s.launches : s.launches.filter((l) => l.devWallet === viewed)), [s.launches, tab, viewed]);
  const list = useMemo(() => sortLaunches(scope.filter((l) => matchLaunch(l, q)), sort), [scope, q, sort]);
  const ids = useMemo(() => new Set(scope.map((l) => l.id)), [scope]);
  const payouts = useMemo(() => s.payouts.filter((p) => ids.has(p.launchId)).sort((a, b) => b.at - a.at), [s.payouts, ids]);
  const notices = useMemo(() => (tab === 'all' ? s.notices : s.notices.filter((n) => n.launchId && ids.has(n.launchId))), [s.notices, ids, tab]);
  const viewedUser = userByWallet(viewed);

  function onLookup(e: FormEvent) {
    e.preventDefault();
    const w = lookup.trim();
    if (!w) {
      toast.error('Enter a demo wallet address');
      return;
    }
    setViewed(w);
    setTab('mine');
  }

  function refresh() {
    setRefreshing(true);
    window.setTimeout(() => {
      reloadFromStorage();
      setRefreshing(false);
      toast.info('Demo refreshed', 'Re-read from local storage. No new activity is invented — balances only change through demo controls.');
    }, 500);
  }

  return (
    <div className="shell">
      <PageHeader
        title="Dashboard"
        sub="Track demo launches, payouts and treasury balances from the shared ledger."
        right={
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-ink-mute">
              Demo refreshed <b className="text-ink-soft">{time(s.refreshedAt)}</b>
            </span>
            <button type="button" className="btn-secondary btn-sm" onClick={refresh} disabled={refreshing}>
              {refreshing ? <Spinner size={14} /> : <Icon name="refresh" size={14} />} Refresh
            </button>
          </div>
        }
      />

      <div className="card mb-5 flex flex-col gap-3 p-3 sm:p-4 md:flex-row md:items-center">
        <Segmented
          label="Launch scope"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: 'All launches' },
            { value: 'mine', label: 'My launches' },
          ]}
        />
        <form onSubmit={onLookup} className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Icon name="wallet" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input
              className="input mono !pl-9 !text-[13px]"
              placeholder="Developer demo wallet, e.g. DemoNv7q…"
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              aria-label="Developer demo wallet"
              list="demo-wallets"
            />
            <datalist id="demo-wallets">
              {USERS.map((u) => (
                <option key={u.id} value={u.wallet}>
                  @{u.username}
                </option>
              ))}
            </datalist>
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
              Viewing developer
              {viewedUser ? (
                <span className="inline-flex items-center gap-1.5 text-ink-body">
                  <Avatar user={viewedUser} size={18} /> @{viewedUser.username}
                </span>
              ) : (
                <span className="text-gold">unknown wallet</span>
              )}
              <span className="mono rounded bg-rail px-1.5 py-0.5">{shortAddr(viewed, 6, 6)}</span>
              {connected && viewed !== connected.wallet && (
                <button type="button" className="link text-[12.5px]" onClick={() => { setViewed(connected.wallet); setLookup(connected.wallet); }}>
                  Back to my wallet
                </button>
              )}
            </>
          ) : (
            <>
              No wallet selected.{' '}
              <button type="button" className="link" onClick={() => ui.open('connect')}>
                Connect demo
              </button>{' '}
              or look up a developer wallet above.
            </>
          )}
        </div>
      )}

      <AggregateCards state={s} launches={scope} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <h2 className="flex-1 text-[17px] font-bold text-ink">{tab === 'all' ? 'All launches' : 'My launches'} <span className="text-[13px] font-medium text-ink-mute">({list.length})</span></h2>
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

          {list.length === 0 ? (
            tab === 'mine' && viewed && !scope.length ? (
              <Empty
                icon="wallet"
                title={viewedUser ? `@${viewedUser.username} has no launches yet` : 'No launches for this wallet'}
                body={
                  <>
                    {viewedUser ? 'This fictional developer has not launched a demo coin.' : 'That address is not in the demo dataset. Try one of the sample developers:'}
                    <span className="mt-3 flex flex-wrap justify-center gap-1.5">
                      {USERS.filter((u) => s.launches.some((l) => l.devUserId === u.id)).slice(0, 4).map((u) => (
                        <button key={u.id} type="button" className="chip bg-rail py-1 text-ink-soft hover:bg-active hover:text-ink" onClick={() => { setLookup(u.wallet); setViewed(u.wallet); }}>
                          <Avatar user={u} size={14} /> @{u.username}
                        </button>
                      ))}
                    </span>
                  </>
                }
                action={
                  <Link to="/" className="btn-primary btn-sm">
                    Launch a coin
                  </Link>
                }
              />
            ) : tab === 'mine' && !viewed ? (
              <Empty icon="wallet" title="Choose a developer wallet" body="Connect a demo wallet or enter a developer wallet above to see its launches." action={<button type="button" className="btn-primary btn-sm" onClick={() => ui.open('connect')}>Connect demo</button>} />
            ) : (
              <Empty title="No launches match your search" action={<button type="button" className="btn-secondary btn-sm" onClick={() => setQ('')}>Clear search</button>} />
            )
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.slice(0, shown).map((l) => (
                  <LaunchCard key={l.id} state={s} launch={l} />
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
            <PayoutTable payouts={payouts.slice(0, 10)} onReceipt={setReceipt} showLaunch={(id) => s.launches.find((l) => l.id === id)} />
          </section>
        </div>

        <aside className="grid content-start gap-4">
          <ConnectedServers state={s} />
          <TreasuryTable state={s} />
          <Feed notices={notices} now={s.now} />
        </aside>
      </div>
      <ReceiptModal target={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

function treasuryPending(state: DemoState) {
  const totals = allTotals(state);
  const out = new Map<string, { pending: number; paid: number; launches: number }>();
  for (const sv of SERVERS) out.set(sv.id, { pending: 0, paid: 0, launches: 0 });
  for (const l of state.launches) {
    if (l.recipient.kind !== 'server') continue;
    const t = totals.get(l.id)!;
    const row = out.get(l.recipient.serverId)!;
    row.pending += t.pending;
    row.paid += t.paid;
    row.launches++;
  }
  return out;
}

function ConnectedServers({ state }: { state: DemoState }) {
  const ui = useUI();
  const me = userById(state.session.discordUserId);
  const rows = treasuryPending(state);
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[14px] font-bold text-ink">Connected servers</h2>
        {me && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-mute">
            <Avatar user={me} size={16} /> @{me.username}
          </span>
        )}
      </div>
      {!me ? (
        <div className="rounded-lg bg-deep p-4 text-center text-[13px] text-ink-mute">
          Connect a demo Discord identity to see servers you manage.
          <button type="button" className="btn-primary btn-sm mt-3 w-full" onClick={() => ui.open('connect')}>
            Connect demo Discord
          </button>
        </div>
      ) : me.manages.length === 0 ? (
        <div className="rounded-lg bg-deep p-4 text-[13px] text-ink-mute">
          @{me.username} has no simulated Manage Server permission anywhere. Switch identity from the account menu to try an admin.
        </div>
      ) : (
        <ul className="grid gap-2">
          {me.manages.map((id) => {
            const sv = SERVERS.find((x) => x.id === id)!;
            const claim = state.claims[id];
            const r = rows.get(id)!;
            return (
              <li key={id} className="flex items-center gap-3 rounded-lg bg-deep p-2.5">
                <ServerIcon server={sv} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-ink">{sv.name}</div>
                  <div className="text-[11.5px] text-ink-mute">
                    {claim ? <span className="text-mint-bright">Claimed</span> : <span className="text-gold">Unclaimed</span>} · {sol(r.pending, 3)} SOL pending
                  </div>
                </div>
                <Link to="/claim" state={{ serverId: id }} className="btn-ghost btn-sm !px-2" aria-label={`Manage ${sv.name}`}>
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

function TreasuryTable({ state }: { state: DemoState }) {
  const rows = treasuryPending(state);
  return (
    <section className="card p-4">
      <h2 className="mb-1 text-[14px] font-bold text-ink">Pending treasury amounts</h2>
      <p className="mb-3 text-[12px] text-ink-mute">Server-treasury share waiting for payout.</p>
      <ul className="divide-y divide-line/40">
        {SERVERS.map((sv) => {
          const r = rows.get(sv.id)!;
          const claimed = Boolean(state.claims[sv.id]);
          return (
            <li key={sv.id} className="flex items-center gap-2.5 py-2">
              <ServerIcon server={sv} size={24} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-body">{sv.name}</span>
              {!claimed && <Icon name="lock" size={12} className="text-gold" aria-label="Unclaimed" />}
              <span className={cx('text-[13px] font-semibold tabular-nums', r.pending > 0 ? 'text-gold' : 'text-ink-dim')}>{sol(r.pending, 3)}</span>
            </li>
          );
        })}
      </ul>
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

function Feed({ notices, now }: { notices: DemoState['notices']; now: number }) {
  const [n, setN] = useState(8);
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <Icon name="bell" size={14} /> Notification feed
        </h2>
        <span className="text-[11px] text-ink-dim">in-app · not sent</span>
      </div>
      {notices.length === 0 ? (
        <p className="rounded-lg bg-deep p-4 text-center text-[13px] text-ink-mute">No notifications for this view yet.</p>
      ) : (
        <ul className="grid gap-1">
          {notices.slice(0, n).map((x) => {
            const [icon, tone] = FEED_ICON[x.kind];
            const body = (
              <>
                <span className={cx('mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full', tone)}>
                  <Icon name={icon} size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium leading-snug text-ink-body">{x.title}</span>
                  <span className="block truncate text-[11.5px] text-ink-mute">{x.body}</span>
                  <span className="block text-[10.5px] text-ink-dim">
                    {ago(x.at, now)} {x.sample && '· sample'}
                  </span>
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
