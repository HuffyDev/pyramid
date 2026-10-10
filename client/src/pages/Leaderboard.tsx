import { Link, useSearchParams } from 'react-router-dom';
import { crackLevel, type BrickView } from '../../../shared/pyramid';
import { usePyramid } from '../lib/pyramid';
import { useNow } from '../lib/hooks';
import { ago, pct, short, usd } from '../lib/format';
import { BrickThumb } from '../components/PyramidStage';

const TABS = [
  { id: 'tallest', label: 'Tallest', sub: 'highest market cap' },
  { id: 'newest', label: 'Newest', sub: 'freshly laid' },
  { id: 'cracked', label: 'Most cracked', sub: 'longest dead, still standing' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function Leaderboard() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('by'))?.id ?? 'tallest') as Tab;
  const { bricks, loaded } = usePyramid();
  const now = useNow(5000);

  const visible = bricks.filter((b) => !b.hidden);
  let rows: BrickView[];
  if (tab === 'tallest') rows = visible.filter((b) => b.mcap != null).sort((a, b) => (b.mcap ?? 0) - (a.mcap ?? 0));
  else if (tab === 'newest') rows = visible.slice().reverse();
  else
    rows = visible
      .filter((b) => crackLevel(b.belowSince, now) > 0)
      .sort((a, b) => crackLevel(b.belowSince, now) - crackLevel(a.belowSince, now) || a.belowSince!.localeCompare(b.belowSince!));
  rows = rows.slice(0, 100);

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-24 pt-10 sm:px-6 md:pt-16">
      <div className="eyebrow">leaderboard</div>
      <h1 className="display mt-3 text-4xl sm:text-5xl">the tall, the new, the cracked.</h1>

      <div className="mt-8 flex gap-1 overflow-x-auto rounded-2xl border border-sand-50/[0.08] bg-night-900/60 p-1 scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setParams({ by: t.id }, { replace: true })}
            className={`min-w-[120px] flex-1 rounded-xl px-4 py-2.5 text-left transition ${tab === t.id ? 'bg-sand-50/[0.07] ring-1 ring-gold/40' : 'hover:bg-sand-50/[0.03]'}`}
            aria-pressed={tab === t.id}
          >
            <div className={`text-sm font-semibold ${tab === t.id ? 'text-sand-50' : 'text-sand-300'}`}>{t.label}</div>
            <div className="truncate text-[11.5px] text-sand-400">{t.sub}</div>
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-sand-50/[0.08] bg-night-900/50">
        <div className="hidden grid-cols-[48px_minmax(0,1fr)_90px_110px_80px_90px] gap-4 border-b border-sand-50/[0.06] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-sand-400 md:grid">
          <span>#</span>
          <span>coin</span>
          <span className="text-right">brick</span>
          <span className="text-right">mcap</span>
          <span className="text-right">24h</span>
          <span className="text-right">{tab === 'cracked' ? 'dead for' : 'placed'}</span>
        </div>
        {!loaded ? (
          <div className="px-5 py-16 text-center font-mono text-sm text-sand-400">loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm text-sand-400">{tab === 'cracked' ? 'No cracks yet. Everything still stands.' : 'No bricks yet. Lay the first one.'}</div>
        ) : (
          <ol className="divide-y divide-sand-50/[0.05]">
            {rows.map((b, i) => {
              const crack = crackLevel(b.belowSince, now);
              return (
                <li key={b.mint}>
                  <Link
                    to={`/brick/${b.mint}`}
                    className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition hover:bg-sand-50/[0.03] md:grid-cols-[48px_minmax(0,1fr)_90px_110px_80px_90px] md:gap-4 md:px-5"
                  >
                    <span className={`num text-sm ${i < 3 && tab === 'tallest' ? 'text-gold' : 'text-sand-400'}`}>{i + 1}</span>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={crack ? 'opacity-60 grayscale-[0.5]' : ''}>
                        <BrickThumb brick={b} size={40} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-sand-50">{b.name}</span>
                          {crack > 0 && <span className="chip shrink-0 border-bad/30 px-1.5 py-0 text-[9px] text-bad">cracked{crack > 1 ? ` ×${crack}` : ''}</span>}
                        </div>
                        <div className="num truncate text-xs text-gold">
                          ${b.ticker} <span className="text-sand-400 md:hidden">· #{b.n}</span>
                          <span className="hidden text-sand-400/70 sm:inline"> · by {short(b.creator)}</span>
                        </div>
                      </div>
                    </div>
                    <span className="num hidden text-right text-sm text-sand-300 md:block">#{b.n}</span>
                    <div className="text-right md:contents">
                      <span className="num block text-sand-50 md:text-right">{usd(b.mcap)}</span>
                      <span className={`num block text-xs md:text-right md:text-sm ${b.ch24 == null ? 'text-sand-400' : b.ch24 >= 0 ? 'text-ok' : 'text-bad'}`}>{pct(b.ch24)}</span>
                    </div>
                    <span className="num hidden text-right text-sm text-sand-400 md:block">{tab === 'cracked' && b.belowSince ? ago(b.belowSince, now).replace(' ago', '') : ago(b.placedAt, now)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
