import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { crackLevel, slotOf, type BrickView } from '../../../shared/pyramid';
import { PyramidRenderer, type Pick as Hit } from '../pyramid/renderer';
import { sigil } from '../pyramid/sprites';
import { getPyramid } from '../lib/pyramid';
import { onNewBrick, usePyramid } from '../lib/pyramid';
import { useMedia, useReducedMotion } from '../lib/motion';
import { useConfig } from '../lib/config';
import { ago, links, pct, short, usd } from '../lib/format';
import { useCopy, useNow } from '../lib/hooks';
import { Icon } from './Icon';
import { LogoMark } from './Logo';

export interface StageHandle {
  focus(n: number): void;
  drop(n: number): void;
  highlight(n: number): void;
}

export const PyramidStage = forwardRef<StageHandle, { className?: string; inset?: { top: number; bottom: number }; controlsClass?: string; onZoomed?: (z: boolean) => void }>(function PyramidStage({ className = '', inset, controlsClass = 'bottom-4 sm:bottom-6', onZoomed }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const r = useRef<PyramidRenderer | null>(null);
  const { bricks } = usePyramid();
  const reduced = useReducedMotion();
  const mobile = useMedia('(max-width: 767px)');
  const [hover, setHover] = useState<Hit | null>(null);
  const [pinned, setPinned] = useState<Hit | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const hintT = useRef<number>();
  const zoomCb = useRef(onZoomed);
  zoomCb.current = onZoomed;

  useEffect(() => {
    const c = canvasRef.current!;
    const ren = new PyramidRenderer(c, {
      reducedMotion: reduced,
      inset,
      onHover: (p) => setHover(p),
      onSelect: (p) => setPinned(p),
      onZoomed: (z) => {
        setZoomed(z);
        zoomCb.current?.(z);
      },
      onHint: (m) => {
        setHint(m);
        window.clearTimeout(hintT.current);
        hintT.current = window.setTimeout(() => setHint(null), 1400);
      },
    });
    r.current = ren;
    return () => ren.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  useEffect(() => {
    r.current?.setBricks(bricks);
  }, [bricks]);

  useEffect(
    () =>
      onNewBrick((b) => {
        r.current?.setBricks(bricksNow());
        r.current?.drop(b.n);
      }),
    [],
  );

  useImperativeHandle(ref, () => ({
    focus: (n) => r.current?.focus(n),
    drop: (n) => r.current?.drop(n),
    highlight: (n) => r.current?.highlightBrick(n),
  }));

  // keep a pinned card glued to its brick while the camera moves
  const active = pinned ?? hover;
  const shown = active?.kind === 'brick' && hover?.kind === 'brick' && hover.n === active.n ? hover : active;
  const close = useCallback(() => setPinned(null), []);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label={`The pyramid: ${bricks.length} bricks`} role="img" />

      {shown && (
        <HoverCard
          pick={shown}
          brick={shown.kind === 'brick' ? bricks[shown.n - 1] : null}
          docked={mobile}
          pinned={!!pinned}
          onClose={close}
        />
      )}

      <div className={`absolute right-4 z-10 flex-col overflow-hidden rounded-xl border border-sand-50/10 bg-night-900/70 backdrop-blur-md sm:right-6 ${controlsClass} ${zoomed ? 'flex' : 'hidden md:flex'}`}>
        <button className="grid h-10 w-10 place-items-center text-sand-200 transition hover:bg-sand-50/10 hover:text-sand-50" onClick={() => r.current?.zoomBy(1.6)} aria-label="Zoom in">
          <Icon name="plus" />
        </button>
        <button className="grid h-10 w-10 place-items-center border-t border-sand-50/10 text-sand-200 transition hover:bg-sand-50/10 hover:text-sand-50" onClick={() => r.current?.zoomBy(1 / 1.6)} aria-label="Zoom out">
          <Icon name="minus" />
        </button>
        <button
          className={`grid h-10 w-10 place-items-center border-t border-sand-50/10 transition hover:bg-sand-50/10 ${zoomed ? 'text-gold' : 'text-sand-400'}`}
          onClick={() => r.current?.fit()}
          aria-label="Fit the whole pyramid"
        >
          <Icon name="expand" />
        </button>
      </div>

      {hint && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 animate-fade rounded-full bg-night-950/80 px-4 py-2 font-mono text-xs text-sand-100 backdrop-blur">
          {hint}
        </div>
      )}
    </div>
  );
});

// the renderer needs the latest array synchronously inside socket callbacks
const bricksNow = () => getPyramid().bricks;

function HoverCard({ pick, brick, docked, pinned, onClose }: { pick: Hit; brick: BrickView | null; docked: boolean; pinned: boolean; onClose: () => void }) {
  const now = useNow(1000);
  const cfg = useConfig();
  const { copied, copy } = useCopy();
  const W = 300;
  const style: React.CSSProperties = docked
    ? {}
    : (() => {
        const { rect } = pick;
        const parentW = window.innerWidth;
        let left = rect.x + rect.w / 2 - W / 2;
        left = Math.max(12, Math.min(parentW - W - 12, left));
        const above = rect.y > 300;
        return above ? { left, top: rect.y - 12, transform: 'translateY(-100%)', width: W } : { left, top: rect.y + rect.h + 12, width: W };
      })();
  const cls = docked
    ? 'absolute inset-x-3 bottom-3 z-20 animate-rise'
    : `absolute z-20 ${pinned ? '' : 'pointer-events-none'} animate-fade`;

  if (pick.kind === 'cap') {
    return (
      <div className={cls} style={style}>
        <div className="panel overflow-hidden p-4 shadow-gold-lg">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/10 ring-1 ring-gold/40">
              <LogoMark size={24} className="text-gold" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="eyebrow text-gold">the capstone</div>
              <div className="display mt-1 text-lg">$PYRAMID</div>
            </div>
            {(pinned || docked) && (
              <button className="btn-quiet -mr-1 -mt-1 p-1.5" onClick={onClose} aria-label="Close">
                <Icon name="x" />
              </button>
            )}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-sand-300">Sits above brick #1. Every coin below it is a brick laid by someone.</p>
          {cfg.pyramidMint ? (
            <button onClick={() => copy(cfg.pyramidMint!)} className="pointer-events-auto mt-3 flex w-full items-center justify-between rounded-lg border border-sand-50/10 bg-night-950/60 px-3 py-2 text-left">
              <span className="num truncate text-xs text-sand-100">{short(cfg.pyramidMint, 8)}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-gold">{copied ? 'copied' : 'copy CA'}</span>
            </button>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-sand-50/15 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-sand-400">CA sealed</div>
          )}
        </div>
      </div>
    );
  }
  if (!brick) return null;
  const crack = crackLevel(brick.belowSince, now);
  const slot = slotOf(brick.n);
  const real = !brick.sim && !brick.dryRun;
  return (
    <div className={cls} style={style}>
      <div className="panel overflow-hidden shadow-gold-lg">
        {brick.hidden ? (
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="eyebrow">brick #{brick.n}</span>
              {(pinned || docked) && (
                <button className="btn-quiet -mr-1 p-1.5" onClick={onClose} aria-label="Close">
                  <Icon name="x" />
                </button>
              )}
            </div>
            <p className="mt-2 text-sm text-sand-300">This brick was sealed by the moderators. It keeps its place — the pyramid only grows.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 p-4 pb-3">
              <BrickThumb brick={brick} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="eyebrow">brick #{brick.n}</span>
                  {crack > 0 && <span className="chip border-bad/30 px-1.5 py-0 text-[9px] text-bad">cracked</span>}
                  {brick.sim && <span className="chip px-1.5 py-0 text-[9px]">sim</span>}
                  {brick.dryRun && <span className="chip px-1.5 py-0 text-[9px]">dry run</span>}
                </div>
                <div className="mt-1 truncate text-[17px] font-semibold text-sand-50">{brick.name}</div>
                <div className="num text-[13px] text-gold">${brick.ticker}</div>
              </div>
              {(pinned || docked) && (
                <button className="btn-quiet -mr-1 -mt-1 p-1.5" onClick={onClose} aria-label="Close">
                  <Icon name="x" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 border-y border-sand-50/[0.06] bg-night-950/40">
              <Cell label="mcap" value={usd(brick.mcap)} />
              <Cell label="24h" value={pct(brick.ch24)} tone={brick.ch24 == null ? undefined : brick.ch24 >= 0 ? 'ok' : 'bad'} />
              <Cell label="placed" value={ago(brick.placedAt, now)} />
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 font-mono text-[11px] text-sand-400">
              <span>by {short(brick.creator)}</span>
              <span>
                row {slot.row + 1} · stone {slot.col + 1}
              </span>
            </div>
            <div className="pointer-events-auto flex flex-wrap gap-1.5 px-4 pb-4">
              <button className="chip transition hover:border-gold/50 hover:text-sand-50" onClick={() => copy(brick.mint)}>
                <Icon name={copied ? 'check' : 'copy'} size={12} />
                {copied ? 'copied' : 'copy CA'}
              </button>
              {real && (
                <>
                  <a className="chip transition hover:border-gold/50 hover:text-sand-50" href={links.pump(brick.mint)} target="_blank" rel="noreferrer">
                    pump.fun
                  </a>
                  <a className="chip transition hover:border-gold/50 hover:text-sand-50" href={links.dex(brick.mint)} target="_blank" rel="noreferrer">
                    dexscreener
                  </a>
                  <a className="chip transition hover:border-gold/50 hover:text-sand-50" href={links.solscan(brick.mint)} target="_blank" rel="noreferrer">
                    solscan
                  </a>
                </>
              )}
              <Link className="chip border-gold/40 text-gold transition hover:bg-gold/10" to={`/brick/${brick.mint}`}>
                open <Icon name="arrow" size={12} />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="px-4 py-2.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-sand-400">{label}</div>
      <div className={`num mt-1 text-[13px] ${tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : 'text-sand-50'}`}>{value}</div>
    </div>
  );
}

export function BrickThumb({ brick, size = 48 }: { brick: Pick<BrickView, 'image' | 'mint' | 'ticker'>; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (brick.image || !ref.current) return;
    const c = ref.current;
    c.width = c.height = size * 2;
    c.getContext('2d')!.drawImage(sigil(brick.mint, brick.ticker, 96), 0, 0, size * 2, size * 2);
  }, [brick.image, brick.mint, brick.ticker, size]);
  return (
    <span className="relative shrink-0 overflow-hidden rounded-lg ring-1 ring-sand-50/15" style={{ width: size, height: size }}>
      {brick.image ? <img src={brick.image} alt="" className="h-full w-full object-cover" loading="lazy" /> : <canvas ref={ref} style={{ width: size, height: size }} />}
    </span>
  );
}
