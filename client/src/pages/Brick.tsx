import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { crackLevel, slotOf } from '../../../shared/pyramid';
import { api } from '../lib/api';
import { useAsync, useCopy, useNow } from '../lib/hooks';
import { usePyramid } from '../lib/pyramid';
import { ago, links, pct, short, usd } from '../lib/format';
import { BrickTile } from '../components/BrickTile';
import { Icon } from '../components/Icon';
import { PyramidRenderer } from '../pyramid/renderer';
import { useReducedMotion } from '../lib/motion';

export default function BrickPage() {
  const { mint = '' } = useParams();
  const { data, error, loading } = useAsync(() => api.brick(mint), [mint]);
  const { bricks } = usePyramid();
  const now = useNow(1000);
  const { copied, copy } = useCopy();
  // live values from the socket store win over the snapshot
  const live = bricks.find((b) => b.mint === mint);
  const b = live ?? data?.brick;

  if (loading && !b) return <div className="mx-auto max-w-[1200px] px-4 py-24 text-center font-mono text-sm text-sand-400">digging…</div>;
  if (!b || error)
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-32 text-center">
        <h1 className="display text-3xl">no such brick.</h1>
        <p className="mt-3 text-sand-400">It may not have landed yet. The pyramid only grows — check back.</p>
        <Link to="/" className="btn-ghost mt-6">
          Back to the pyramid
        </Link>
      </div>
    );

  const slot = slotOf(b.n);
  const crack = crackLevel(b.belowSince, now);
  const real = !b.sim && !b.dryRun;
  const d = data?.detail;

  if (b.hidden)
    return (
      <div className="mx-auto max-w-[900px] px-4 py-24 text-center">
        <div className="flex justify-center">
          <BrickTile width={280} data={{ ticker: '', hidden: true, mint: b.mint }} />
        </div>
        <h1 className="display mt-8 text-3xl">brick #{b.n} is sealed.</h1>
        <p className="mt-3 text-sand-400">The moderators hid this brick. It keeps its place in row {slot.row + 1} — the pyramid only grows.</p>
      </div>
    );

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-20 pt-8 sm:px-6 md:pt-12">
      <Link to={`/?brick=${b.n}`} className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-sand-400 hover:text-sand-100">
        <span className="rotate-180">
          <Icon name="arrow" size={13} />
        </span>
        the pyramid
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="shrink-0 drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)]">
              <BrickTile width={260} data={{ ticker: b.ticker, mint: b.mint, image: b.image, mcap: b.mcap, crack, n: b.n }} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow">brick #{b.n}</span>
                {crack > 0 && <span className="chip border-bad/30 text-bad">cracked</span>}
                {b.sim && <span className="chip">sim</span>}
                {b.dryRun && <span className="chip">dry run</span>}
              </div>
              <h1 className="display mt-2 break-words text-3xl sm:text-4xl">{b.name}</h1>
              <div className="num mt-1 text-lg text-gold">${b.ticker}</div>
            </div>
          </div>

          {d?.description && <p className="mt-8 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-sand-200">{d.description}</p>}

          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-sand-50/[0.08] bg-sand-50/[0.06] sm:grid-cols-4">
            <Stat label="market cap" value={usd(b.mcap)} />
            <Stat label="24h" value={pct(b.ch24)} tone={b.ch24 == null ? undefined : b.ch24 >= 0 ? 'ok' : 'bad'} />
            <Stat label="placed" value={ago(b.placedAt, now)} />
            <Stat label="position" value={`row ${slot.row + 1} · stone ${slot.col + 1}`} />
          </dl>

          <div className="mt-6 space-y-2">
            <button onClick={() => copy(b.mint)} className="flex w-full items-center gap-3 rounded-xl border border-sand-50/10 bg-night-950/60 px-3.5 py-3 text-left transition hover:border-gold/50">
              <span className="font-mono text-[10px] uppercase tracking-widest text-sand-400">CA</span>
              <span className="num min-w-0 flex-1 break-all text-[13px] text-sand-100">{b.mint}</span>
              <span className={`flex shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-widest ${copied ? 'text-gold' : 'text-sand-400'}`}>
                <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'copied' : 'copy'}
              </span>
            </button>
            <div className="flex items-center justify-between px-1 font-mono text-xs text-sand-400">
              <span>creator {short(b.creator, 6)}</span>
              {real && (
                <a className="hover:text-sand-100" href={`https://solscan.io/account/${b.creator}`} target="_blank" rel="noreferrer">
                  view wallet ↗
                </a>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {real && (
              <>
                <a className="btn-ghost" href={links.pump(b.mint)} target="_blank" rel="noreferrer">
                  pump.fun <Icon name="out" size={13} className="text-sand-400" />
                </a>
                <a className="btn-ghost" href={links.dex(b.mint)} target="_blank" rel="noreferrer">
                  DexScreener <Icon name="out" size={13} className="text-sand-400" />
                </a>
                <a className="btn-ghost" href={links.solscan(b.mint)} target="_blank" rel="noreferrer">
                  Solscan <Icon name="out" size={13} className="text-sand-400" />
                </a>
              </>
            )}
            {d?.twitter && (
              <a className="btn-ghost" href={d.twitter} target="_blank" rel="noreferrer">
                <Icon name="xlogo" size={14} /> X
              </a>
            )}
            {d?.telegram && (
              <a className="btn-ghost" href={d.telegram} target="_blank" rel="noreferrer">
                <Icon name="telegram" size={14} /> Telegram
              </a>
            )}
            {d?.website && (
              <a className="btn-ghost" href={d.website} target="_blank" rel="noreferrer">
                <Icon name="globe" size={14} /> Website
              </a>
            )}
          </div>

          <div className="mt-10 overflow-hidden rounded-2xl border border-sand-50/[0.08] bg-night-950">
            {real ? (
              <iframe title={`${b.ticker} chart`} src={links.dexEmbed(b.mint)} className="h-[460px] w-full" loading="lazy" />
            ) : (
              <div className="grid h-[260px] place-items-center p-6 text-center">
                <div>
                  <Icon name="chart" size={22} className="mx-auto text-sand-400" />
                  <p className="mt-3 text-sm text-sand-400">{b.sim ? 'Simulated brick — no chart.' : 'Dry-run brick — never launched on-chain, so there is no chart.'}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="lg:pt-2">
          <div className="lg:sticky lg:top-24">
            <div className="eyebrow mb-3 flex items-center justify-between">
              <span>position in the pyramid</span>
              <span className="text-sand-400/70">
                #{b.n} of {bricks.length || data?.total}
              </span>
            </div>
            <MiniPyramid n={b.n} />
            <Link to={`/?brick=${b.n}`} className="btn-ghost mt-3 w-full">
              <Icon name="pyramid" /> Find it in the pyramid
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="bg-night-900 px-4 py-4">
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-sand-400">{label}</dt>
      <dd className={`num mt-1.5 text-[17px] ${tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : 'text-sand-50'}`}>{value}</dd>
    </div>
  );
}

function MiniPyramid({ n }: { n: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const r = useRef<PyramidRenderer | null>(null);
  const { bricks } = usePyramid();
  const reduced = useReducedMotion();
  useEffect(() => {
    r.current = new PyramidRenderer(ref.current!, { reducedMotion: reduced, compact: true });
    return () => r.current?.destroy();
  }, [reduced]);
  useEffect(() => {
    r.current?.setBricks(bricks);
    r.current?.highlightBrick(n, 1e9);
  }, [bricks, n]);
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-sand-50/[0.08] bg-[radial-gradient(circle_at_50%_20%,#1b2150,#070915_70%)]">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden />
    </div>
  );
}
