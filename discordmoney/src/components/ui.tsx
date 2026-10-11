import { useState, type ReactNode } from 'react';
import { serverById, userById } from '../lib/fixtures';
import { OFFER_STATUS_LABEL, STATUS_LABEL, type LaunchStatus } from '../lib/ledger';
import type { CoinImage, OfferStatus, Server, User } from '../lib/types';
import { Icon, type IconName } from './Icon';
import { useToast } from './Toast';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/* --------------------------------- Badges --------------------------------- */

const STATUS_STYLE: Record<LaunchStatus, string> = {
  accruing: 'bg-blurple/15 text-blurple-light ring-blurple/30',
  'awaiting-claim': 'bg-gold/12 text-gold ring-gold/30',
  ready: 'bg-mint/15 text-mint-bright ring-mint/30',
  paid: 'bg-white/[0.06] text-ink-soft ring-white/10',
  failed: 'bg-danger/12 text-[#FF8A8D] ring-danger/30',
};
const STATUS_DOT: Record<LaunchStatus, string> = {
  accruing: 'bg-blurple-light',
  'awaiting-claim': 'bg-gold',
  ready: 'bg-mint-bright',
  paid: 'bg-ink-mute',
  failed: 'bg-danger',
};

export function StatusBadge({ status }: { status: LaunchStatus }) {
  return (
    <span className={cx('chip ring-1 ring-inset', STATUS_STYLE[status])}>
      <span className={cx('h-1.5 w-1.5 rounded-full', STATUS_DOT[status], status === 'accruing' && 'animate-pulse')} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const OFFER_STYLE: Record<OfferStatus, string> = {
  awaiting: 'bg-gold/12 text-gold ring-gold/30',
  accepted: 'bg-blurple/15 text-blurple-light ring-blurple/30',
  posted: 'bg-link/12 text-link ring-link/30',
  retention: 'bg-fuchsia/12 text-[#F68BC4] ring-fuchsia/30',
  completed: 'bg-mint/15 text-mint-bright ring-mint/30',
  refunded: 'bg-white/[0.06] text-ink-soft ring-white/10',
  cancelled: 'bg-danger/10 text-[#FF8A8D] ring-danger/25',
};

export function OfferBadge({ status }: { status: OfferStatus }) {
  return <span className={cx('chip ring-1 ring-inset', OFFER_STYLE[status])}>{OFFER_STATUS_LABEL[status]}</span>;
}

export function SampleTag({ sample, label }: { sample: boolean; label?: string }) {
  return sample ? (
    <span className="chip bg-white/[0.05] text-[10px] uppercase tracking-wide text-ink-mute ring-1 ring-inset ring-white/10">
      {label ?? 'Sample data'}
    </span>
  ) : (
    <span className="chip bg-blurple/15 text-[10px] uppercase tracking-wide text-blurple-light ring-1 ring-inset ring-blurple/25">
      {label ?? 'Your demo'}
    </span>
  );
}

export function DemoTag({ children = 'Demo' }: { children?: ReactNode }) {
  return (
    <span className="chip bg-blurple text-[10px] uppercase tracking-wider text-white">{children}</span>
  );
}

/* --------------------------------- Avatars -------------------------------- */

export function Avatar({ user, size = 32, status }: { user?: User; size?: number; status?: boolean }) {
  const initials = (user?.displayName ?? '?')
    .split(/\s|\./)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="inline-flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
        style={{ background: user?.color ?? '#4E5058', fontSize: size * 0.38 }}
        aria-hidden="true"
      >
        {initials}
      </span>
      {status && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full border-[3px] border-card bg-mint"
          style={{ width: size * 0.42, height: size * 0.42 }}
        />
      )}
    </span>
  );
}

export function ServerIcon({ server, size = 32, rounded = 'rounded-[30%]' }: { server?: Server; size?: number; rounded?: string }) {
  const initials = (server?.name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 3);
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center font-semibold text-white', rounded)}
      style={{ width: size, height: size, background: server?.color ?? '#4E5058', fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function UserChip({ userId, size = 20 }: { userId: string; size?: number }) {
  const u = userById(userId);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar user={u} size={size} />
      <span className="truncate text-ink-body">@{u?.username ?? 'unknown'}</span>
    </span>
  );
}

export function ServerChip({ serverId, size = 20 }: { serverId: string; size?: number }) {
  const s = serverById(serverId);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <ServerIcon server={s} size={size} />
      <span className="truncate text-ink-body">{s?.name ?? 'Unknown'}</span>
    </span>
  );
}

/* -------------------------------- Coin art -------------------------------- */

const PALETTES = [
  ['#5865F2', '#949CF7'],
  ['#23A55A', '#57F287'],
  ['#EB459E', '#F68BC4'],
  ['#F0B232', '#FEE75C'],
  ['#00A8FC', '#7FD3FF'],
  ['#F23F43', '#FF9A9C'],
  ['#4752C4', '#EB459E'],
  ['#1A8B49', '#00A8FC'],
];
const GLYPHS = [
  'M12 4c4.4 0 8 2.9 8 6.6 0 3.6-3.6 6.5-8 6.5-.8 0-1.6-.1-2.3-.3L6 19v-3.4C4.8 14.4 4 12.6 4 10.6 4 6.9 7.6 4 12 4z',
  'M13 3 5 13.5h6L10 21l8-10.5h-6z',
  'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z',
  'M12 3 20 12l-8 9-8-9z',
  'M5 19c0-8 5-14 14-14 0 9-6 14-14 14zM5 19l7-7',
  'M7 8a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM17 8a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM4 13c0 4 3.6 7 8 7s8-3 8-7c0-2.5-3.6-4-8-4s-8 1.5-8 4z',
  'M12 20a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm0-4a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  'M4 15c2-4 4-4 6 0s4 4 6 0 4-4 4-4M4 9c2-4 4-4 6 0s4 4 6 0 4-4 4-4',
];

export function CoinArt({ image, size = 48, className, label }: { image: CoinImage; size?: number; className?: string; label?: string }) {
  if (image.kind === 'upload')
    return (
      <img
        src={image.dataUrl}
        alt={label ? `${label} coin image` : ''}
        width={size}
        height={size}
        className={cx('shrink-0 rounded-xl object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  const [a, b] = PALETTES[image.seed % PALETTES.length];
  const glyph = GLYPHS[(image.seed * 5 + 1) % GLYPHS.length];
  const id = `g${image.seed}`;
  const stroke = (image.seed * 5 + 1) % GLYPHS.length >= 6;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={cx('shrink-0 rounded-xl', className)}
      role={label ? 'img' : undefined}
      aria-label={label ? `${label} coin art` : undefined}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" fill={`url(#${id})`} />
      <circle cx="24" cy="24" r="16" fill="rgba(0,0,0,0.16)" />
      <circle cx="24" cy="24" r="16" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" strokeDasharray="2 2.4" />
      <g transform="translate(12 12)">
        <path
          d={glyph}
          fill={stroke ? 'none' : '#fff'}
          stroke="#fff"
          strokeWidth={stroke ? 2 : 0.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fillRule="evenodd"
        />
      </g>
    </svg>
  );
}

/* --------------------------------- Bits ----------------------------------- */

export function CopyButton({ value, label = 'Copy', toast: toastText, className, iconOnly }: { value: string; label?: string; toast?: string; className?: string; iconOnly?: boolean }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        toast.error('Clipboard unavailable', 'Select and copy the text manually.');
        ta.remove();
        return;
      }
      ta.remove();
    }
    setDone(true);
    toast.success(toastText ?? 'Copied to clipboard', value);
    window.setTimeout(() => setDone(false), 1400);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={cx(
        'inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] font-medium text-ink-mute transition-colors hover:bg-white/[0.06] hover:text-ink',
        className,
      )}
      aria-label={`${label}: ${value}`}
      title={`${label}`}
    >
      <Icon name={done ? 'check' : 'copy'} size={13} className={done ? 'text-mint-bright' : undefined} />
      {!iconOnly && <span>{done ? 'Copied' : label}</span>}
    </button>
  );
}

export function MonoId({ value, copy = true, className }: { value: string; copy?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-0.5', className)}>
      <span className="mono truncate rounded bg-rail px-1.5 py-0.5 text-ink-soft">{value}</span>
      {copy && <CopyButton value={value} iconOnly label="Copy ID" toast="Demo ID copied" />}
    </span>
  );
}

export function Stat({ label, value, sub, icon, accent }: { label: string; value: ReactNode; sub?: ReactNode; icon?: IconName; accent?: 'mint' | 'blurple' | 'gold' | 'fuchsia' | 'danger' }) {
  const tone = {
    mint: 'text-mint-bright bg-mint/12',
    blurple: 'text-blurple-light bg-blurple/15',
    gold: 'text-gold bg-gold/12',
    fuchsia: 'text-[#F68BC4] bg-fuchsia/12',
    danger: 'text-[#FF8A8D] bg-danger/12',
  }[accent ?? 'blurple'];
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="kpi">{label}</span>
        {icon && (
          <span className={cx('inline-flex h-7 w-7 items-center justify-center rounded-lg', tone)}>
            <Icon name={icon} size={14} />
          </span>
        )}
      </div>
      <div className="text-[22px] font-bold leading-none tracking-tight text-ink">{value}</div>
      {sub && <div className="text-[12px] text-ink-mute">{sub}</div>}
    </div>
  );
}

export function Empty({ icon = 'search', title, body, action }: { icon?: IconName; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-rail text-ink-mute">
        <Icon name={icon} size={22} />
      </span>
      <div className="text-base font-semibold text-ink">{title}</div>
      {body && <p className="max-w-sm text-sm text-ink-mute">{body}</p>}
      {action}
    </div>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cx('animate-spin', className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-lg bg-rail p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            const i = options.findIndex((x) => x.value === value);
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              const n = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
              onChange(n.value);
              (e.currentTarget.parentElement?.querySelectorAll('button')[options.indexOf(n)] as HTMLButtonElement | undefined)?.focus();
            }
          }}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]',
            value === o.value ? 'bg-active text-ink shadow-sm' : 'text-ink-mute hover:bg-hover hover:text-ink-body',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, action, sub }: { eyebrow?: string; title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-blurple-light">{eyebrow}</div>}
        <h2 className="text-xl font-bold tracking-tight text-ink">{title}</h2>
        {sub && <p className="mt-1 text-sm text-ink-mute">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, htmlFor, hint, error, children, right }: { label: string; htmlFor?: string; hint?: ReactNode; error?: string | null; children: ReactNode; right?: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="label">
          {label}
        </label>
        {right}
      </div>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-[12px] text-[#FF8A8D]" role="alert">
          <Icon name="alert" size={12} /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-ink-mute">{hint}</p>
      ) : null}
    </div>
  );
}

export function KV({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
      <span className="shrink-0 text-ink-mute">{k}</span>
      <span className={cx('min-w-0 truncate text-right text-ink-body', mono && 'mono')}>{v}</span>
    </div>
  );
}

export function Notice({ tone = 'info', children, icon }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode; icon?: IconName }) {
  const t = {
    info: 'border-blurple/30 bg-blurple/10 text-ink-body [&_svg]:text-blurple-light',
    warn: 'border-gold/30 bg-gold/10 text-ink-body [&_svg]:text-gold',
    error: 'border-danger/35 bg-danger/10 text-ink-body [&_svg]:text-[#FF8A8D]',
    success: 'border-mint/30 bg-mint/10 text-ink-body [&_svg]:text-mint-bright',
  }[tone];
  const i: IconName = icon ?? (tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'alert');
  return (
    <div className={cx('flex gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-5', t)}>
      <Icon name={i} size={15} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
