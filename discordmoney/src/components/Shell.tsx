import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { connectDiscord, connectWallet, disconnectAll, disconnectDiscord, disconnectWallet, switchIdentity } from '../lib/actions';
import { DCM_CA, DCM_PUMP_URL, DCM_X_URL, USERS, userById } from '../lib/fixtures';
import { shortAddr } from '../lib/format';
import { useDemo } from '../lib/store';
import { Icon, XGlyph, type IconName } from './Icon';
import { Wordmark } from './Logo';
import { useToast } from './Toast';
import { useUI } from './UIState';
import { Avatar, CopyButton, cx } from './ui';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Launch', icon: 'rocket', end: true },
  { to: '/launches', label: 'Launches', icon: 'grid' },
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/offers', label: 'Posts', icon: 'megaphone' },
  { to: '/claim', label: 'Claim', icon: 'shield' },
];

export function DemoBanner() {
  const ui = useUI();
  return (
    <div className="border-b border-black/30 bg-blurple text-white">
      <div className="shell flex h-8 items-center justify-between gap-3 text-[12.5px] font-medium">
        <span className="flex min-w-0 items-center gap-2">
          <Icon name="info" size={14} className="shrink-0" />
          <span className="truncate"><span className="hidden sm:inline">Interactive demo — </span><span className="sm:hidden">Demo — </span>no real funds or tokens.</span>
        </span>
        <button type="button" onClick={() => ui.open('reset')} className="shrink-0 rounded px-2 py-0.5 text-[12px] font-semibold hover:bg-white/15">
          Reset demo
        </button>
      </div>
    </div>
  );
}

export function Header() {
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  useEffect(() => setMobile(false), [loc.pathname]);
  return (
    <header className="sticky top-0 z-40 border-b border-black/40 bg-rail/90 backdrop-blur-md">
      <div className="shell flex h-14 items-center gap-3">
        <Link to="/" className="mr-2 shrink-0 rounded-md" aria-label="DiscordMoney home">
          <Wordmark />
        </Link>
        <nav className="hidden flex-1 items-center gap-0.5 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'relative rounded-md px-3 py-1.5 text-[14px] font-medium transition-colors',
                  isActive ? 'bg-active text-ink' : 'text-ink-mute hover:bg-hover hover:text-ink-body',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {n.label}
                  {isActive && <span className="absolute inset-x-3 -bottom-[11px] h-[2px] rounded-full bg-blurple" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <AccountControl />
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-soft hover:bg-hover hover:text-ink md:hidden"
            aria-label={mobile ? 'Close menu' : 'Open menu'}
            aria-expanded={mobile}
            aria-controls="mobile-nav"
            onClick={() => setMobile((v) => !v)}
          >
            <Icon name={mobile ? 'x' : 'menu'} size={20} />
          </button>
        </div>
      </div>
      {mobile && (
        <nav id="mobile-nav" className="animate-fade-in border-t border-black/30 bg-card md:hidden" aria-label="Mobile">
          <div className="shell grid gap-1 py-2">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-medium',
                    isActive ? 'bg-active text-ink' : 'text-ink-soft hover:bg-hover hover:text-ink',
                  )
                }
              >
                <Icon name={n.icon} size={18} />
                {n.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}

function AccountControl() {
  const s = useDemo();
  const ui = useUI();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const wallet = userById(s.session.walletUserId);
  const discord = userById(s.session.discordUserId);
  const who = discord ?? wallet;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        const n = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[n].focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), 10);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setSwitching(false);
  }, [open]);

  if (!who)
    return (
      <button type="button" className="btn-primary btn-sm" onClick={() => ui.open('connect')}>
        <Icon name="link" size={14} />
        Connect demo
      </button>
    );

  const item = 'flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[13.5px] text-ink-body hover:bg-blurple hover:text-white focus:bg-blurple focus:text-white focus:outline-none';
  return (
    <div className="relative" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 transition-colors hover:bg-hover"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar user={who} size={28} status={Boolean(discord)} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-semibold text-ink">{discord ? `@${discord.username}` : 'Demo wallet'}</span>
          <span className="mono block text-[11px] text-ink-mute">{wallet ? shortAddr(wallet.wallet) : 'Wallet not connected'}</span>
        </span>
        <Icon name="chevronDown" size={14} className={cx('text-ink-mute transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" aria-label="Demo account" className="absolute right-0 top-full z-50 mt-2 w-72 animate-pop-in overflow-hidden rounded-lg border border-black/40 bg-[#111214] shadow-pop">
          <div className="relative h-14 bg-blurple" style={{ background: `linear-gradient(135deg, ${who.color}, #4752C4)` }} />
          <div className="px-3 pb-3">
            <div className="-mt-7 mb-2 inline-flex rounded-full border-[5px] border-[#111214]">
              <Avatar user={who} size={52} status={Boolean(discord)} />
            </div>
            <div className="text-[15px] font-bold text-ink">{who.displayName}</div>
            <div className="text-[13px] text-ink-soft">{discord ? `@${discord.username}` : 'Discord not connected'}</div>
            <div className="mt-2 rounded-md bg-card p-2 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-mute">Demo wallet</span>
                {wallet ? (
                  <span className="flex items-center gap-1">
                    <span className="mono text-ink-body">{shortAddr(wallet.wallet, 6, 4)}</span>
                    <CopyButton value={wallet.wallet} iconOnly label="Copy wallet" toast="Demo wallet copied" />
                  </span>
                ) : (
                  <span className="text-ink-dim">Not connected</span>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-ink-mute">Discord ID</span>
                <span className="mono text-ink-body">{discord ? discord.discordId : '—'}</span>
              </div>
            </div>
            <div className="mt-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-dim">Simulated connections only</div>
          </div>
          <div className="divider mx-2" />
          <div className="p-1.5">
            {!switching ? (
              <>
                {!wallet && (
                  <button role="menuitem" type="button" className={item} onClick={() => { connectWallet(); toast.success('Demo wallet connected'); setOpen(false); }}>
                    <Icon name="wallet" size={15} /> Use demo wallet
                  </button>
                )}
                {!discord && (
                  <button role="menuitem" type="button" className={item} onClick={() => { connectDiscord(); toast.success('Demo Discord connected'); setOpen(false); }}>
                    <Icon name="chat" size={15} /> Connect demo Discord
                  </button>
                )}
                <button role="menuitem" type="button" className={item} onClick={() => setSwitching(true)}>
                  <Icon name="switch" size={15} /> Switch demo identity
                </button>
                {wallet && (
                  <button role="menuitem" type="button" className={item} onClick={() => { disconnectWallet(); toast.info('Demo wallet disconnected'); setOpen(false); }}>
                    <Icon name="wallet" size={15} /> Disconnect wallet
                  </button>
                )}
                {discord && (
                  <button role="menuitem" type="button" className={item} onClick={() => { disconnectDiscord(); toast.info('Demo Discord disconnected'); setOpen(false); }}>
                    <Icon name="chat" size={15} /> Disconnect Discord
                  </button>
                )}
                <button
                  role="menuitem"
                  type="button"
                  className={cx(item, 'text-[#FF8A8D] hover:bg-danger-btn focus:bg-danger-btn')}
                  onClick={() => { disconnectAll(); toast.info('Disconnected', 'Your form input was kept.'); setOpen(false); btn.current?.focus(); }}
                >
                  <Icon name="logout" size={15} /> Disconnect all
                </button>
              </>
            ) : (
              <>
                <button role="menuitem" type="button" className={cx(item, 'text-ink-mute')} onClick={() => setSwitching(false)}>
                  <Icon name="chevronLeft" size={15} /> Back
                </button>
                <div className="max-h-64 overflow-y-auto">
                  {USERS.map((u) => (
                    <button
                      key={u.id}
                      role="menuitem"
                      type="button"
                      className={item}
                      onClick={() => {
                        switchIdentity(u.id);
                        toast.success(`Now acting as @${u.username}`, 'Fictional identity — no real account.');
                        setOpen(false);
                      }}
                    >
                      <Avatar user={u} size={22} />
                      <span className="flex-1 truncate">@{u.username}</span>
                      {u.id === who.id && <Icon name="check" size={14} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TokenStrip() {
  const ui = useUI();
  return (
    <div className="border-b border-black/30 bg-card/80">
      <div className="shell flex h-10 items-center gap-2 overflow-x-auto text-[12.5px] [scrollbar-width:none]">
        <span className="inline-flex shrink-0 items-center gap-1.5 font-bold text-ink">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blurple text-[9px] font-black text-white">D</span>
          $DCM
        </span>
        <span className="chip shrink-0 bg-mint/15 text-mint-bright ring-1 ring-inset ring-mint/25">CA</span>
        <span className="mono shrink-0 text-ink-soft"><span className="hidden lg:inline">{DCM_CA}</span><span className="lg:hidden">{shortAddr(DCM_CA, 5, 5)}</span></span>
        <CopyButton value={DCM_CA} label="Copy CA" toast="Contract address copied" className="shrink-0" />
        <span className="ml-auto" />
        <a href={DCM_X_URL} target="_blank" rel="noreferrer noopener" className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 font-medium text-ink-soft hover:bg-white/[0.06] hover:text-ink" aria-label="DiscordMoney on X">
          <XGlyph size={12} /> <span className="hidden sm:inline">@Payondiscord</span>
        </a>
        <a href={DCM_PUMP_URL} target="_blank" rel="noreferrer noopener" className="hidden shrink-0 items-center gap-1 rounded px-2 py-1 font-medium text-ink-soft hover:bg-white/[0.06] hover:text-ink sm:inline-flex">
          pump.fun <Icon name="arrowRight" size={12} className="-rotate-45" />
        </a>
        <button type="button" onClick={() => ui.open('token')} className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 font-medium text-blurple-light hover:bg-white/[0.06] hover:text-blurple-pale">
          Token overview <Icon name="chevronRight" size={13} />
        </button>
      </div>
    </div>
  );
}

export function Footer() {
  const ui = useUI();
  return (
    <footer className="mt-16 border-t border-black/30 bg-rail">
      <div className="shell flex flex-col gap-4 py-8 text-[13px] text-ink-mute sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Wordmark compact />
          <span className="hidden text-ink-dim sm:inline">·</span>
          <span>Independent prototype. Not affiliated with Discord or pump.fun.</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <a className="inline-flex items-center gap-1.5 hover:text-ink" href={DCM_X_URL} target="_blank" rel="noreferrer noopener">
            <XGlyph size={12} /> @Payondiscord
          </a>
          <Link className="hover:text-ink" to="/launches">Launches</Link>
          <Link className="hover:text-ink" to="/offers">Posts</Link>
          <Link className="hover:text-ink" to="/claim">Claim</Link>
          <button type="button" className="hover:text-ink" onClick={() => ui.open('reset')}>
            Reset demo
          </button>
        </div>
      </div>
    </footer>
  );
}

export function PageHeader({ eyebrow, title, sub, right }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.025em] text-ink sm:text-[34px]">{title}</h1>
        {sub && <p className="mt-2 max-w-2xl text-[15px] text-ink-mute">{sub}</p>}
      </div>
      {right}
    </div>
  );
}
