import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LogoMark } from './Logo';
import { WalletButton } from './WalletButton';
import { Icon } from './Icon';
import { useLaunchSheet } from './LaunchSheet';
import { stats, usePyramid } from '../lib/pyramid';
import { useTicking } from '../lib/motion';
import { usd } from '../lib/format';
import { useConfig } from '../lib/config';

function Stat({ label, value, money = false }: { label: string; value: number; money?: boolean }) {
  const v = useTicking(value);
  return (
    <div className="flex flex-col leading-none">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-sand-400">{label}</span>
      <span className="num mt-1.5 text-[15px] font-medium text-sand-50">{money ? usd(v) : Math.round(v).toLocaleString()}</span>
    </div>
  );
}

export function LiveStats({ className = '' }: { className?: string }) {
  const { bricks } = usePyramid();
  const s = stats(bricks);
  return (
    <div className={`flex items-center gap-6 ${className}`}>
      <Stat label="bricks laid" value={s.count} />
      <span className="h-7 w-px bg-sand-50/10" />
      <Stat label="total mcap" value={s.total} money />
      <span className="h-7 w-px bg-sand-50/10" />
      <Stat label="laid today" value={s.today} />
    </div>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`group flex items-center gap-2.5 ${className}`} aria-label="PYRAMID home">
      <LogoMark size={26} className="text-gold transition group-hover:drop-shadow-[0_0_10px_#ffb52e]" />
      <span className="wordmark text-[17px] sm:text-[19px]">Pyramid</span>
    </Link>
  );
}

function Header() {
  const { open } = useLaunchSheet();
  const { connected } = usePyramid();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 8);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  const nav = ({ isActive }: { isActive: boolean }) => `rounded-lg px-3 py-2 text-sm transition ${isActive ? 'text-sand-50' : 'text-sand-400 hover:text-sand-100'}`;
  return (
    <header className={`sticky top-0 z-40 transition-colors duration-300 ${scrolled ? 'border-b border-sand-50/[0.06] bg-night-900/80 backdrop-blur-xl' : 'bg-transparent'}`}>
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
        <Wordmark />
        <nav className="ml-4 hidden items-center md:flex">
          <NavLink to="/leaderboard" className={nav}>
            Leaderboard
          </NavLink>
          <a href="/#capstone" className="rounded-lg px-3 py-2 text-sm text-sand-400 transition hover:text-sand-100">
            $PYRAMID
          </a>
        </nav>
        <div className="mx-auto hidden lg:block">
          <LiveStats />
        </div>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <span className={`hidden h-1.5 w-1.5 rounded-full sm:block ${connected ? 'bg-ok animate-breathe' : 'bg-night-500'}`} title={connected ? 'live' : 'reconnecting'} />
          <div className="hidden sm:block">
            <WalletButton compact />
          </div>
          <button className="btn-gold px-4" onClick={open}>
            <Icon name="plus" size={15} strokeWidth={2.2} />
            Lay a brick
          </button>
        </div>
      </div>
    </header>
  );
}

function DryRunBar() {
  const { dryRun, simMode } = useConfig();
  if (!dryRun && !simMode) return null;
  return (
    <div className="relative z-40 border-b border-gold/20 bg-gold/[0.07] px-4 py-1.5 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-gold-hot">
      {dryRun && 'dry run · launches are simulated, nothing is broadcast'}
      {dryRun && simMode && ' · '}
      {simMode && 'sim mode · synthetic bricks'}
    </div>
  );
}

export function Footer() {
  const { pyramidX } = useConfig();
  return (
    <footer className="relative border-t border-sand-50/[0.06] bg-night-950/60">
      <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-start">
          <div>
            <Wordmark />
            <p className="display mt-4 text-xl text-sand-200">the pyramid only grows.</p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-sand-400">
            <Link to="/" className="hover:text-sand-100">
              Pyramid
            </Link>
            <Link to="/leaderboard" className="hover:text-sand-100">
              Leaderboard
            </Link>
            <a href="/#capstone" className="hover:text-sand-100">
              $PYRAMID
            </a>
            {pyramidX && (
              <a href={pyramidX} target="_blank" rel="noreferrer" className="hover:text-sand-100">
                X
              </a>
            )}
          </div>
        </div>
        <p className="mt-10 max-w-3xl text-[13px] leading-relaxed text-sand-400/80">
          non-custodial launch tool. you launch from your own wallet, at your own risk. a joke about memecoins. not financial advice. not affiliated with pump.fun or any
          person.
        </p>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return (
    <div className="flex min-h-svh flex-col">
      <DryRunBar />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
