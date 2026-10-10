import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { crackLevel } from '../../../shared/pyramid';
import { PyramidStage, BrickThumb, type StageHandle } from '../components/PyramidStage';
import { TickerStrip } from '../components/TickerStrip';
import { LiveStats } from '../components/Layout';
import { useLaunchSheet } from '../components/LaunchSheet';
import { BrickTile } from '../components/BrickTile';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { CopyField } from '../components/bits';
import { usePyramid } from '../lib/pyramid';
import { useConfig } from '../lib/config';
import { useMedia } from '../lib/motion';
import { links, pct, usd } from '../lib/format';

export default function Home() {
  const stage = useRef<StageHandle>(null);
  const { open, landed } = useLaunchSheet();
  const { bricks, loaded } = usePyramid();
  const [params, setParams] = useSearchParams();
  const mobile = useMedia('(max-width: 767px)');
  const [zoomed, setZoomed] = useState(false);

  // a launch just landed: fly to its slot and drop it in
  useEffect(() => {
    const n = landed?.launch.brickNo;
    if (!n) return;
    const t = setTimeout(() => {
      stage.current?.focus(n);
      stage.current?.drop(n);
      stage.current?.highlight(n);
    }, 250);
    return () => clearTimeout(t);
  }, [landed]);

  // /?brick=47 deep link
  const deep = Number(params.get('brick'));
  useEffect(() => {
    if (!deep || !loaded || deep > bricks.length) return;
    stage.current?.focus(deep);
    stage.current?.highlight(deep);
    params.delete('brick');
    setParams(params, { replace: true });
  }, [deep, loaded, bricks.length, params, setParams]);

  return (
    <>
      {/* ── hero: the pyramid ── */}
      <section className="relative -mt-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_520px_at_50%_18%,#1b2150_0%,transparent_70%)]" />
        <PyramidStage
          ref={stage}
          className="h-[clamp(600px,100svh,720px)] md:h-[max(640px,calc(100svh-44px))]"
          inset={mobile ? { top: 250, bottom: 84 } : { top: 64, bottom: 10 }}
          controlsClass="bottom-[84px] md:bottom-6"
          onZoomed={setZoomed}
        />

        {/* headline: top-left sky on desktop, top center on mobile */}
        <div className={`pointer-events-none absolute inset-x-0 top-16 z-10 transition-[opacity,visibility] duration-500 ${zoomed ? 'invisible opacity-0' : 'visible opacity-100'}`}>
          <div className="mx-auto max-w-[1440px] px-4 pt-5 text-center sm:px-6 md:pt-10 md:text-left">
            <div className="eyebrow animate-rise text-gold/90">a solana launchpad · est. brick #1</div>
            <h1 className="display mt-3 animate-rise text-[34px] leading-[1.02] [animation-delay:80ms] sm:text-5xl md:max-w-[440px] md:text-[64px]">every coin is a brick.</h1>
            <p className="mt-3 hidden animate-rise text-[15px] leading-relaxed text-sand-300 [animation-delay:160ms] md:block md:max-w-[360px]">
              Launch a coin from your own wallet and it becomes a brick in a live pyramid. Brand-new coins drop into the bottom row. Dead ones crack. Nothing is ever removed.
            </p>
            <div className="pointer-events-auto mt-6 hidden animate-rise items-center gap-3 [animation-delay:240ms] md:flex">
              <button className="btn-gold px-5 py-3 text-[15px]" onClick={open}>
                <Icon name="plus" strokeWidth={2.2} /> lay a brick.
              </button>
              <a href="#how" className="btn-ghost px-4 py-3">
                how it works
              </a>
            </div>
            <div className="mt-4 flex justify-center md:hidden">
              <LiveStats className="gap-4 [&>span]:h-6" />
            </div>
          </div>
        </div>

        {/* mobile CTA over the dunes */}
        <div className="absolute inset-x-4 bottom-4 z-10 md:hidden">
          <button className="btn-gold w-full py-3.5 text-[15px]" onClick={open}>
            <Icon name="plus" strokeWidth={2.2} /> lay a brick.
          </button>
        </div>

        {loaded && bricks.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-[62%] z-10 text-center">
            <p className="display text-lg text-sand-200 sm:text-xl">the pyramid awaits its first brick.</p>
            <p className="mt-1 font-mono text-xs text-sand-400">brick #1 becomes the apex, right under the capstone.</p>
          </div>
        )}
      </section>

      <TickerStrip />

      <Capstone />
      <HowItWorks />
      <TallestPreview />
    </>
  );
}

function Capstone() {
  const { pyramidMint, pyramidX } = useConfig();
  return (
    <section id="capstone" className="relative scroll-mt-16 overflow-hidden border-b border-sand-50/[0.06]">
      <div className="pointer-events-none absolute -left-40 top-1/2 h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-gold/10 blur-[120px]" />
      <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-[minmax(0,420px)_1fr] md:gap-16 md:py-28">
        <div className="relative mx-auto flex aspect-square w-full max-w-[340px] items-center justify-center">
          <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle,#ffb52e40_0%,transparent_65%)]" />
          <div className="absolute inset-0 rounded-full border border-gold/15" />
          <div className="absolute inset-[9%] rounded-full border border-dashed border-gold/10" />
          <LogoMark size={190} className="relative text-gold drop-shadow-[0_0_40px_#ffb52e88]" />
        </div>
        <div>
          <div className="eyebrow text-gold">the capstone</div>
          <h2 className="display mt-3 text-4xl sm:text-5xl">$PYRAMID</h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-sand-300">
            Every brick below it was laid by someone. $PYRAMID sits on top, above brick #1. No fee is taken from launches; the token is the monument's flag, nothing more.
          </p>
          <div className="mt-7 max-w-lg">
            {pyramidMint ? (
              <CopyField label="contract address" value={pyramidMint} />
            ) : (
              <div>
                <div className="label">contract address</div>
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-sand-50/15 bg-night-950/40 px-3.5 py-3 font-mono text-[13px] text-sand-400">
                  <Icon name="lock" size={14} /> sealed until launch
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {pyramidMint && (
              <>
                <a className="btn-ghost" href={links.dex(pyramidMint)} target="_blank" rel="noreferrer">
                  <Icon name="chart" /> Chart
                </a>
                <a className="btn-ghost" href={links.pump(pyramidMint)} target="_blank" rel="noreferrer">
                  pump.fun <Icon name="out" size={13} className="text-sand-400" />
                </a>
              </>
            )}
            {pyramidX && (
              <a className="btn-ghost" href={pyramidX} target="_blank" rel="noreferrer">
                <Icon name="xlogo" size={14} /> X
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: 'I', t: 'Carve it', d: 'Name, ticker, a square image and your links. A content filter keeps slurs and scams out of the stone.' },
    { n: 'II', t: 'Sign it yourself', d: 'The transaction is built for pump.fun and signed in your own wallet — Phantom, Solflare or Backpack. We never touch your keys.' },
    { n: 'III', t: 'Watch it land', d: 'Your coin drops into the bottom row as the next brick. Its glow follows its market cap, live.' },
  ];
  return (
    <section id="how" className="relative scroll-mt-16 border-b border-sand-50/[0.06]">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 md:py-24">
        <div className="eyebrow">how a brick is laid</div>
        <h2 className="display mt-3 max-w-xl text-3xl sm:text-4xl">lay a brick. the pyramid only grows.</h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-sand-50/[0.08] bg-sand-50/[0.06] md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="group bg-night-900 p-6 transition hover:bg-night-850 sm:p-8">
              <div className="font-display text-2xl font-semibold text-gold/80 transition group-hover:text-gold">{s.n}</div>
              <h3 className="mt-4 text-lg font-semibold text-sand-50">{s.t}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-sand-300">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-14 grid items-center gap-10 md:grid-cols-[1fr_auto]">
          <div>
            <h3 className="display text-2xl">glow, crack, never fall.</h3>
            <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-sand-300">
              A brick's glow is its market cap: sandstone at launch, molten gold as it climbs. A coin that stays dead for 24 hours cracks and dims — deeper after three days, chipped after a week.
              It keeps its slot. Nothing is ever taken out of the pyramid.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4 md:justify-end">
            {[
              { label: 'new', d: { ticker: 'SAND', mint: 'demo-a', mcap: 5200 } },
              { label: 'glowing', d: { ticker: 'GOLD', mint: 'demo-b', mcap: 2_400_000 } },
              { label: 'cracked', d: { ticker: 'DUST', mint: 'demo-c', mcap: 2900, crack: 2 } },
            ].map((x) => (
              <figure key={x.label} className="text-center">
                <BrickTile width={150} data={x.d} />
                <figcaption className="mt-2 font-mono text-[11px] uppercase tracking-widest text-sand-400">{x.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TallestPreview() {
  const { bricks } = usePyramid();
  const top = bricks
    .filter((b) => !b.hidden && b.mcap != null && !crackLevel(b.belowSince))
    .sort((a, b) => (b.mcap ?? 0) - (a.mcap ?? 0))
    .slice(0, 5);
  if (!top.length) return null;
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="eyebrow">leaderboard</div>
          <h2 className="display mt-3 text-3xl sm:text-4xl">tallest bricks</h2>
        </div>
        <Link to="/leaderboard" className="btn-ghost shrink-0">
          All <Icon name="arrow" size={14} />
        </Link>
      </div>
      <ol className="divide-y divide-sand-50/[0.06] overflow-hidden rounded-2xl border border-sand-50/[0.08] bg-night-900/60">
        {top.map((b, i) => (
          <li key={b.mint}>
            <Link to={`/brick/${b.mint}`} className="flex items-center gap-4 px-4 py-3 transition hover:bg-sand-50/[0.03] sm:px-5">
              <span className="num w-5 text-sm text-sand-400">{i + 1}</span>
              <BrickThumb brick={b} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sand-50">{b.name}</div>
                <div className="num text-xs text-gold">${b.ticker}</div>
              </div>
              <span className="num hidden text-xs text-sand-400 sm:block">#{b.n}</span>
              <div className="w-24 text-right">
                <div className="num text-sand-50">{usd(b.mcap)}</div>
                <div className={`num text-xs ${(b.ch24 ?? 0) >= 0 ? 'text-ok' : 'text-bad'}`}>{pct(b.ch24)}</div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
