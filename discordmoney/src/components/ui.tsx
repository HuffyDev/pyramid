import { useState, type ReactNode } from 'react';
import { OFFER_STATUS_LABEL, STATUS_LABEL, type LaunchStatus } from '../lib/ledger';
import type { OfferStatus, Person } from '../lib/types';
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


/* --------------------------------- Avatars -------------------------------- */

const SWATCH = ['#5865F2', '#23A55A', '#EB459E', '#F0B232', '#00A8FC', '#F23F43', '#949CF7', '#80848E'];
export const colorFor = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return SWATCH[h % SWATCH.length];
};
const initialsOf = (name: string, n = 2) =>
  name
    .replace(/^@/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, n)
    .toUpperCase() || '?';

export function Avatar({ user, name, size = 32, status }: { user?: Person | null; name?: string; size?: number; status?: boolean }) {
  const label = user?.displayName ?? user?.username ?? name ?? '?';
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span
          className="inline-flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
          style={{ background: colorFor(user?.id ?? label), fontSize: size * 0.38 }}
          aria-hidden="true"
        >
          {initialsOf(label)}
        </span>
      )}
      {status && <span className="absolute -bottom-0.5 -right-0.5 rounded-full border-[3px] border-card bg-mint" style={{ width: size * 0.42, height: size * 0.42 }} />}
    </span>
  );
}

export function ServerIcon({ name, iconUrl, id, size = 32, rounded = 'rounded-[30%]' }: { name: string; iconUrl?: string; id?: string; size?: number; rounded?: string }) {
  if (iconUrl) return <img src={iconUrl} alt="" width={size} height={size} className={cx('shrink-0 object-cover', rounded)} style={{ width: size, height: size }} />;
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center font-semibold text-white', rounded)}
      style={{ width: size, height: size, background: colorFor(id ?? name), fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initialsOf(name, 3)}
    </span>
  );
}

/* -------------------------------- Coin image ------------------------------- */

export function CoinImage({ src, name, size = 48, className }: { src?: string; name: string; size?: number; className?: string }) {
  if (src) return <img src={src} alt={`${name} coin`} width={size} height={size} className={cx('shrink-0 rounded-xl object-cover', className)} style={{ width: size, height: size }} />;
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-xl font-black text-white', className)}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${colorFor(name)}, #4752C4)`, fontSize: size * 0.32 }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
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
      {copy && <CopyButton value={value} iconOnly label="Copy" toast="Copied" />}
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
