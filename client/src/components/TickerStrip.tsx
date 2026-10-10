import { Link } from 'react-router-dom';
import { usePyramid } from '../lib/pyramid';
import { useNow } from '../lib/hooks';
import { ago } from '../lib/format';
import { useReducedMotion } from '../lib/motion';

/** "brick #47 placed · $TICKER · 12s ago" — the newest bricks, looping. */
export function TickerStrip() {
  const { bricks, loaded } = usePyramid();
  const now = useNow(1000);
  const reduced = useReducedMotion();
  const recent = bricks.slice(-24).reverse().filter((b) => !b.hidden);
  const items = recent.length ? recent : [];
  const Row = ({ hidden = false }: { hidden?: boolean }) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden}>
      {items.map((b) => (
        <Link
          key={b.mint + (hidden ? ':2' : '')}
          to={`/brick/${b.mint}`}
          tabIndex={hidden ? -1 : 0}
          className="group flex items-center gap-2 whitespace-nowrap px-5 font-mono text-[12px] text-sand-400 transition hover:text-sand-100"
        >
          <span className="h-1 w-1 rotate-45 bg-gold/70 group-hover:bg-gold" />
          <span>
            brick <span className="text-sand-100">#{b.n}</span> placed
          </span>
          <span className="text-sand-50/20">·</span>
          <span className="text-gold">${b.ticker}</span>
          <span className="text-sand-50/20">·</span>
          <span className="tabular-nums">{ago(b.placedAt, now)}</span>
        </Link>
      ))}
    </div>
  );
  return (
    <div className="relative border-y border-sand-50/[0.07] bg-night-950/70 backdrop-blur">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-night-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-night-950 to-transparent" />
      <div className="flex h-11 items-center overflow-hidden">
        {!loaded ? null : items.length === 0 ? (
          <div className="w-full text-center font-mono text-[12px] text-sand-400">no bricks yet · the first launch becomes the apex</div>
        ) : (
          <div className={`flex ${reduced ? 'overflow-x-auto scrollbar-none' : 'animate-marquee hover:[animation-play-state:paused]'}`} style={{ animationDuration: `${Math.max(30, items.length * 5)}s` }}>
            <Row />
            {!reduced && <Row hidden />}
          </div>
        )}
      </div>
    </div>
  );
}
