import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, XGlyph } from '../components/Icon';
import { LaunchCard } from '../components/launch';
import { Modal } from '../components/Overlay';
import { useToast } from '../components/Toast';
import { useUI } from '../components/UIState';
import { Avatar, CoinArt, DemoTag, Field, KV, Notice, Segmented, ServerIcon, Spinner, cx } from '../components/ui';
import { connectWallet, createLaunch } from '../lib/actions';
import { SAMPLE_DCM_PER_SOL, SERVERS, USERS, serverById, userById } from '../lib/fixtures';
import { compact, int, shortAddr, sol, solLabel, solToLamports } from '../lib/format';
import { platformTotals } from '../lib/ledger';
import { useDemo } from '../lib/store';
import type { Recipient } from '../lib/types';
import { LINK_RE, toThumbnail, validateImage, validateSocial } from '../lib/validate';

/* ---------------------------------- Draft --------------------------------- */

interface Draft {
  image: { dataUrl: string; name: string; size: number } | null;
  name: string;
  ticker: string;
  description: string;
  mode: 'member' | 'server';
  memberId: string;
  serverId: string;
  channel: string;
  message: string;
  devBuy: string;
  socialsOpen: boolean;
  x: string;
  discord: string;
  website: string;
}

const EMPTY: Draft = {
  image: null,
  name: '',
  ticker: '',
  description: '',
  mode: 'member',
  memberId: 'usr-minty',
  serverId: 'srv-pixel',
  channel: 'announcements',
  message: '',
  devBuy: '0',
  socialsOpen: false,
  x: '',
  discord: '',
  website: '',
};
const DRAFT_KEY = 'discordmoney:launch-draft';

function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return EMPTY;
}

type Errors = Partial<Record<'image' | 'name' | 'ticker' | 'description' | 'message' | 'devBuy' | 'x' | 'discord' | 'website' | 'recipient', string>>;

function validate(d: Draft): Errors {
  const e: Errors = {};
  if (!d.image) e.image = 'Add a coin image.';
  if (!d.name.trim()) e.name = 'Name is required.';
  else if (d.name.length > 32) e.name = 'Maximum 32 characters.';
  if (!d.ticker) e.ticker = 'Ticker is required.';
  else if (d.ticker.length > 10) e.ticker = 'Maximum 10 characters.';
  else if (!/^[A-Z0-9]+$/.test(d.ticker)) e.ticker = 'Letters and numbers only.';
  if (d.description.length > 280) e.description = 'Maximum 280 characters.';
  if (d.message.length > 80) e.message = 'Maximum 80 characters.';
  else if (LINK_RE.test(d.message)) e.message = 'Links are not allowed in payout messages.';
  const lam = solToLamports(d.devBuy);
  if (lam === null) e.devBuy = 'Enter a number like 0.5';
  else if (lam > 10 * 1e9) e.devBuy = 'Maximum dev buy is 10 SOL.';
  for (const k of ['x', 'discord', 'website'] as const) {
    const err = validateSocial(k, d[k]);
    if (err) e[k] = err;
  }
  if (d.mode === 'member' && !userById(d.memberId)) e.recipient = 'Choose a member.';
  if (d.mode === 'server' && !serverById(d.serverId)) e.recipient = 'Choose a server.';
  return e;
}

/* ---------------------------------- Page ---------------------------------- */

export default function LaunchPage() {
  const s = useDemo();
  const recent = useMemo(() => [...s.launches].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6), [s.launches]);
  return (
    <div className="shell">
      <section className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_440px] lg:gap-10">
        <Hero />
        <LaunchForm />
      </section>
      <Flywheel />
      <section className="mt-14">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-blurple-light">Recent launches</div>
            <h2 className="text-xl font-bold tracking-tight text-ink">Fresh from the community</h2>
          </div>
          <Link to="/launches" className="btn-secondary btn-sm">
            See all launches <Icon name="arrowRight" size={14} />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recent.map((l) => (
            <LaunchCard key={l.id} state={s} launch={l} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Hero() {
  const steps = [
    { t: 'Launch a coin', d: 'Create a community token with a name, ticker and image.', icon: 'rocket' as const },
    { t: 'Route creator fees', d: 'Allocate fees to a member or a server treasury.', icon: 'coins' as const },
    { t: 'Notify your community', d: 'Preview payout updates in Discord.', icon: 'bell' as const },
  ];
  return (
    <div className="lg:sticky lg:top-24 lg:pt-6">
      <div className="inline-flex items-center gap-2 rounded-full border border-blurple/30 bg-blurple/10 py-1 pl-1 pr-3 text-[12.5px] font-medium text-blurple-pale">
        <DemoTag />
        <Icon name="flame" size={13} className="text-[#F68BC4]" />
        Platform fees → $DCM buybacks &amp; burns
      </div>
      <h1 className="mt-5 text-[40px] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink sm:text-[54px]">
        Launch a community coin.
        <br />
        <span className="shine">Get paid through Discord.</span>
      </h1>
      <p className="mt-5 max-w-[460px] text-[16px] leading-relaxed text-ink-soft">
        Turn creator fees into community support. Choose a member or server treasury, preview the payout, and follow every step.
      </p>
      <ol className="mt-8 grid max-w-[480px] gap-2.5">
        {steps.map((st, i) => (
          <li key={st.t} className="flex items-start gap-3.5 rounded-xl border border-line/50 bg-card/60 p-3.5 backdrop-blur">
            <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blurple text-white">
              <Icon name={st.icon} size={17} />
              <span className="absolute -right-1.5 -top-1.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-card bg-ink text-[10px] font-black text-rail">
                {i + 1}
              </span>
            </span>
            <span>
              <span className="block text-[15px] font-semibold text-ink">{st.t}</span>
              <span className="block text-[13px] text-ink-mute">{st.d}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-5 max-w-[480px] text-[12.5px] leading-relaxed text-ink-dim">
        Discord is the identity and notification layer. Payouts conceptually go to linked Solana wallets — there is no built-in Discord crypto wallet. Everything here is simulated.
      </p>
    </div>
  );
}

/* ---------------------------------- Form ---------------------------------- */

function LaunchForm() {
  const s = useDemo();
  const ui = useUI();
  const toast = useToast();
  const [d, setD] = useState<Draft>(loadDraft);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [review, setReview] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const wallet = userById(s.session.walletUserId);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* draft is best-effort */
    }
  }, [d]);

  const errors = validate(d);
  const show = (k: keyof Errors) => (submitted || touched[k] ? errors[k] : undefined);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const blur = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));

  const server = serverById(d.serverId);
  const member = userById(d.memberId);
  const claim = s.claims[d.serverId];

  async function onFile(f: File | undefined) {
    if (!f) return;
    const err = validateImage(f);
    if (err) {
      setImgErr(err);
      return;
    }
    setImgErr(null);
    setImgBusy(true);
    try {
      const dataUrl = await toThumbnail(f);
      set('image', { dataUrl, name: f.name, size: f.size });
      setTouched((t) => ({ ...t, image: true }));
    } catch (e) {
      setImgErr((e as Error).message);
    } finally {
      setImgBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    void onFile(e.dataTransfer.files?.[0]);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!wallet) {
      connectWallet();
      toast.success('Demo wallet connected', 'Your form input was kept.');
      return;
    }
    setSubmitted(true);
    if (Object.keys(errors).length) {
      const first = Object.keys(errors)[0];
      if (first === 'x' || first === 'discord' || first === 'website') set('socialsOpen', true);
      window.setTimeout(() => {
        const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
        el?.focus();
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 30);
      toast.error('Check the highlighted fields', `${Object.keys(errors).length} field(s) need attention.`);
      return;
    }
    setReview(true);
  }

  const recipient: Recipient = d.mode === 'member' ? { kind: 'member', userId: d.memberId } : { kind: 'server', serverId: d.serverId };
  const devBuyLam = solToLamports(d.devBuy) ?? 0;

  return (
    <div className="card relative overflow-hidden shadow-glow">
      <div className="flex items-center justify-between border-b border-black/20 bg-deep/60 px-5 py-3.5">
        <div>
          <h2 className="text-[15px] font-bold text-ink">Create a coin</h2>
          <p className="text-[12px] text-ink-mute">All fields are simulated locally</p>
        </div>
        {wallet ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/15 px-2.5 py-1 text-[11.5px] font-semibold text-mint-bright">
            <span className="h-1.5 w-1.5 rounded-full bg-mint-bright" /> {shortAddr(wallet.wallet)}
          </span>
        ) : (
          <button type="button" onClick={() => ui.open('connect')} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11.5px] font-semibold text-ink-soft hover:bg-white/10">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-dim" /> Not connected
          </button>
        )}
      </div>
      <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-4 p-5">
        {/* Image */}
        <Field label="Coin image" error={imgErr ?? show('image')} hint="PNG, JPG, GIF or WebP · max 4MB">
          {d.image ? (
            <div className="flex items-center gap-3 rounded-lg border border-line/60 bg-input p-2.5">
              <img src={d.image.dataUrl} alt="Coin preview" className="h-16 w-16 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-ink">{d.image.name}</div>
                <div className="text-[12px] text-ink-mute">{(d.image.size / 1024).toFixed(0)} KB · preview ready</div>
              </div>
              <button type="button" className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                Replace
              </button>
              <button type="button" className="rounded-md p-2 text-ink-mute hover:bg-danger/15 hover:text-[#FF8A8D]" aria-label="Remove image" onClick={() => set('image', null)}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-field="image"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              className={cx(
                'flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
                drag ? 'border-blurple bg-blurple/10' : show('image') || imgErr ? 'border-danger/60 bg-input' : 'border-line bg-input hover:border-blurple/60 hover:bg-[#1A1B1E]',
              )}
            >
              {imgBusy ? (
                <Spinner size={22} className="text-blurple-light" />
              ) : (
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blurple/15 text-blurple-light">
                  <Icon name="upload" size={18} />
                </span>
              )}
              <span className="text-[13.5px] font-medium text-ink-body">{imgBusy ? 'Processing image…' : drag ? 'Drop to upload' : 'Drag & drop or click to upload'}</span>
              <span className="text-[11.5px] text-ink-dim">Square images look best</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" tabIndex={-1} aria-label="Upload coin image" onChange={(e) => void onFile(e.target.files?.[0])} />
        </Field>

        <div className="grid grid-cols-[1fr_130px] gap-3">
          <Field label="Name" htmlFor="f-name" error={show('name')} right={<Counter n={d.name.length} max={32} />}>
            <input
              id="f-name"
              data-field="name"
              className={cx('input', show('name') && 'input-error')}
              value={d.name}
              maxLength={32}
              placeholder="Guild Cat"
              onChange={(e) => set('name', e.target.value)}
              onBlur={blur('name')}
              aria-invalid={Boolean(show('name'))}
            />
          </Field>
          <Field label="Ticker" htmlFor="f-ticker" error={show('ticker')} right={<Counter n={d.ticker.length} max={10} />}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim">$</span>
              <input
                id="f-ticker"
                data-field="ticker"
                className={cx('input mono !pl-6 !text-[14px] uppercase', show('ticker') && 'input-error')}
                value={d.ticker}
                maxLength={10}
                placeholder="GCAT"
                onChange={(e) => set('ticker', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                onBlur={blur('ticker')}
                aria-invalid={Boolean(show('ticker'))}
                autoCapitalize="characters"
              />
            </div>
          </Field>
        </div>

        <Field label="Description" htmlFor="f-desc" error={show('description')} right={<Counter n={d.description.length} max={280} />}>
          <textarea
            id="f-desc"
            data-field="description"
            className={cx('input min-h-[76px] resize-y', show('description') && 'input-error')}
            value={d.description}
            maxLength={280}
            placeholder="What is this coin about? Who does it support?"
            onChange={(e) => set('description', e.target.value)}
            onBlur={blur('description')}
          />
        </Field>

        {/* Recipient */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label !mb-0">Fee recipient</span>
            <Segmented
              label="Recipient type"
              size="sm"
              value={d.mode}
              onChange={(v) => set('mode', v)}
              options={[
                { value: 'member', label: <><Icon name="user" size={12} /> Member</> },
                { value: 'server', label: <><Icon name="server" size={12} /> Server treasury</> },
              ]}
            />
          </div>
          <div className="rounded-lg border border-blurple/45 bg-blurple/[0.07] p-3 shadow-[inset_3px_0_0_#5865F2]">
            {d.mode === 'member' ? (
              <div className="grid gap-2.5">
                <select
                  aria-label="Member"
                  data-field="recipient"
                  className="input !py-2"
                  value={d.memberId}
                  onChange={(e) => set('memberId', e.target.value)}
                >
                  {USERS.map((u) => (
                    <option key={u.id} value={u.id}>
                      @{u.username} — {u.displayName}
                    </option>
                  ))}
                </select>
                {member && (
                  <div className="flex items-center gap-3">
                    <Avatar user={member} size={38} status />
                    <div className="min-w-0 flex-1 text-[12.5px]">
                      <div className="font-semibold text-ink">@{member.username}</div>
                      <div className="mono truncate text-ink-mute">ID {member.discordId}</div>
                    </div>
                    <div className="text-right text-[12px]">
                      <div className="inline-flex items-center gap-1 font-semibold text-mint-bright">
                        <Icon name="check" size={12} /> Wallet linked
                      </div>
                      <div className="mono text-ink-mute">{shortAddr(member.wallet)}</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-2.5">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <select
                    aria-label="Server"
                    data-field="recipient"
                    className="input !py-2"
                    value={d.serverId}
                    onChange={(e) => {
                      const sv = serverById(e.target.value);
                      setD((x) => ({ ...x, serverId: e.target.value, channel: sv?.announcementChannel ?? '' }));
                    }}
                  >
                    {SERVERS.map((sv) => (
                      <option key={sv.id} value={sv.id}>
                        {sv.name}
                      </option>
                    ))}
                  </select>
                  <select aria-label="Announcement channel" className="input !w-auto !py-2" value={d.channel} onChange={(e) => set('channel', e.target.value)}>
                    {server?.channels.map((c) => (
                      <option key={c} value={c}>
                        #{c}
                      </option>
                    ))}
                  </select>
                </div>
                {server && (
                  <div className="flex items-center gap-3">
                    <ServerIcon server={server} size={38} />
                    <div className="min-w-0 flex-1 text-[12.5px]">
                      <div className="font-semibold text-ink">{server.name}</div>
                      <div className="mono truncate text-ink-mute">ID {server.discordId}</div>
                    </div>
                    <div className="text-right text-[12px]">
                      {claim ? (
                        <>
                          <div className="inline-flex items-center gap-1 font-semibold text-mint-bright">
                            <Icon name="check" size={12} /> Treasury claimed
                          </div>
                          <div className="mono text-ink-mute">{shortAddr(claim.wallet)}</div>
                        </>
                      ) : (
                        <>
                          <div className="inline-flex items-center gap-1 font-semibold text-gold">
                            <Icon name="lock" size={12} /> Unclaimed
                          </div>
                          <Link to="/claim" className="link block text-[11.5px]">
                            Claim server →
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {!claim && <p className="text-[11.5px] text-ink-mute">Fees accrue now; payouts unlock after a demo admin claims the treasury.</p>}
              </div>
            )}
          </div>
        </div>

        <Field label="Payout message (optional)" htmlFor="f-msg" error={show('message')} hint="Shown in the Discord payout preview. No links." right={<Counter n={d.message.length} max={80} />}>
          <input
            id="f-msg"
            data-field="message"
            className={cx('input', show('message') && 'input-error')}
            value={d.message}
            maxLength={80}
            placeholder="Thanks for keeping the lights on!"
            onChange={(e) => {
              set('message', e.target.value);
              setTouched((t) => ({ ...t, message: true }));
            }}
          />
        </Field>

        <Field label="Demo dev buy (optional)" htmlFor="f-buy" error={show('devBuy')} hint="Default 0 · maximum 10 SOL · nothing is spent">
          <div className="relative">
            <input
              id="f-buy"
              data-field="devBuy"
              inputMode="decimal"
              className={cx('input !pr-14', show('devBuy') && 'input-error')}
              value={d.devBuy}
              onChange={(e) => set('devBuy', e.target.value.replace(',', '.'))}
              onBlur={blur('devBuy')}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-mute">SOL</span>
          </div>
        </Field>

        <div className="rounded-lg border border-line/60">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2.5 text-[13.5px] font-medium text-ink-body hover:bg-hover"
            aria-expanded={d.socialsOpen}
            onClick={() => set('socialsOpen', !d.socialsOpen)}
          >
            <span className="inline-flex items-center gap-2">
              <Icon name={d.socialsOpen ? 'chevronDown' : 'plus'} size={15} /> Add socials
              <span className="text-[12px] text-ink-dim">optional</span>
            </span>
            {(d.x || d.discord || d.website) && <span className="chip bg-blurple/15 text-blurple-light">{[d.x, d.discord, d.website].filter(Boolean).length} added</span>}
          </button>
          {d.socialsOpen && (
            <div className="grid gap-3 border-t border-line/60 p-3">
              <SocialInput icon={<XGlyph size={13} />} label="X URL" field="x" value={d.x} placeholder="https://x.com/yourcoin" error={show('x')} onChange={(v) => set('x', v)} onBlur={blur('x')} />
              <SocialInput icon={<Icon name="chat" size={14} />} label="Discord invite URL" field="discord" value={d.discord} placeholder="https://discord.gg/yourserver" error={show('discord')} onChange={(v) => set('discord', v)} onBlur={blur('discord')} />
              <SocialInput icon={<Icon name="globe" size={14} />} label="Website URL" field="website" value={d.website} placeholder="https://yourcoin.example" error={show('website')} onChange={(v) => set('website', v)} onBlur={blur('website')} />
            </div>
          )}
        </div>

        <div className="inset grid gap-1 p-3 text-[13px]">
          <div className="flex justify-between">
            <span className="text-ink-mute">Demo platform fee</span>
            <span className="font-semibold text-ink">10% of creator fees</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-mute">Recipient share</span>
            <span className="font-semibold text-mint-bright">90% → {d.mode === 'member' ? `@${member?.username}` : `${server?.name} treasury`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-mute">Demo dev buy</span>
            <span className="font-semibold text-ink">{solLabel(devBuyLam)}</span>
          </div>
        </div>

        <button type="submit" className="btn-primary h-11 w-full text-[15px] font-semibold">
          {wallet ? (
            <>
              Review demo launch <Icon name="arrowRight" size={16} />
            </>
          ) : (
            <>
              <Icon name="wallet" size={16} /> Connect demo wallet
            </>
          )}
        </button>
        <p className="-mt-1 text-center text-[11.5px] text-ink-dim">No real transaction, signature or payment. Demo only.</p>
      </form>

      <ReviewModal
        open={review}
        onClose={() => setReview(false)}
        draft={d}
        recipient={recipient}
        devBuy={devBuyLam}
        onDone={() => {
          setD(EMPTY);
          setSubmitted(false);
          setTouched({});
          try {
            sessionStorage.removeItem(DRAFT_KEY);
          } catch {
            /* ignore */
          }
        }}
      />
    </div>
  );
}

function Counter({ n, max }: { n: number; max: number }) {
  return <span className={cx('text-[11px] tabular-nums', n > max ? 'text-danger' : n > max * 0.85 ? 'text-gold' : 'text-ink-dim')}>{n}/{max}</span>;
}

function SocialInput({ icon, label, field, value, placeholder, error, onChange, onBlur }: { icon: ReactNode; label: string; field: string; value: string; placeholder: string; error?: string; onChange: (v: string) => void; onBlur: () => void }) {
  return (
    <Field label={label} htmlFor={`f-${field}`} error={error}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute">{icon}</span>
        <input id={`f-${field}`} data-field={field} type="url" inputMode="url" className={cx('input !pl-9', error && 'input-error')} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
      </div>
    </Field>
  );
}

/* --------------------------------- Review --------------------------------- */

const STAGES = ['Validating details', 'Creating demo coin', 'Registering recipient', 'Preparing Discord notification'];

function ReviewModal({ open, onClose, draft, recipient, devBuy, onDone }: { open: boolean; onClose: () => void; draft: Draft; recipient: Recipient; devBuy: number; onDone: () => void }) {
  const s = useDemo();
  const nav = useNavigate();
  const toast = useToast();
  const [stage, setStage] = useState(-1);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [injectFailure, setInjectFailure] = useState(false);
  const running = useRef(false);
  const wallet = userById(s.session.walletUserId);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (!open) {
      setStage(-1);
      setFailedAt(null);
      running.current = false;
    }
  }, [open]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const busy = stage >= 0 && failedAt === null;

  function run(from: number) {
    if (running.current) return; // duplicate-submit guard
    running.current = true;
    setFailedAt(null);
    const failStage = injectFailure ? 2 : -1;
    const step = (i: number) => {
      setStage(i);
      timers.current.push(
        window.setTimeout(() => {
          if (i === failStage) {
            setFailedAt(i);
            setInjectFailure(false);
            running.current = false;
            return;
          }
          if (i < STAGES.length - 1) step(i + 1);
          else {
            const r = createLaunch({
              name: draft.name,
              ticker: draft.ticker,
              description: draft.description,
              image: { kind: 'upload', dataUrl: draft.image!.dataUrl },
              recipient,
              payoutMessage: draft.message,
              devBuy,
              socials: { x: draft.x.trim() || undefined, discord: draft.discord.trim() || undefined, website: draft.website.trim() || undefined },
            });
            running.current = false;
            if (!r.ok) {
              setFailedAt(i);
              toast.error('Launch failed', r.error);
              return;
            }
            setStage(STAGES.length);
            timers.current.push(
              window.setTimeout(() => {
                onDone();
                onClose();
                toast.success(`${draft.name} launched (demo)`, 'Saved locally. Nothing was deployed.');
                nav(`/launches/${r.value}`);
              }, 450),
            );
          }
        }, 650 + Math.random() * 250),
      );
    };
    step(from);
  }

  const recipLabel = recipient.kind === 'member' ? `@${userById(recipient.userId)?.username}` : `${serverById(recipient.serverId)?.name} treasury`;
  const dcmPerFee = SAMPLE_DCM_PER_SOL / 10; // 0.1 SOL platform share at the sample rate

  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={busy}
      title={stage >= 0 ? (failedAt !== null ? 'Simulated launch failed' : stage >= STAGES.length ? 'Demo coin created' : 'Simulating launch…') : 'Review demo launch'}
      description={stage < 0 ? 'Check everything before simulating. Nothing is deployed or charged.' : undefined}
      footer={
        stage < 0 ? (
          <>
            <label className="mr-auto inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-mute">
              <input type="checkbox" className="h-4 w-4 accent-[#5865F2]" checked={injectFailure} onChange={(e) => setInjectFailure(e.target.checked)} />
              Simulate a failure
            </label>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Back to edit
            </button>
            <button type="button" className="btn-primary" data-autofocus onClick={() => run(0)} disabled={running.current}>
              <Icon name="play" size={14} /> Simulate launch
            </button>
          </>
        ) : failedAt !== null ? (
          <>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Back to edit
            </button>
            <button type="button" className="btn-primary" data-autofocus onClick={() => run(failedAt)}>
              <Icon name="refresh" size={14} /> Retry from “{STAGES[failedAt]}”
            </button>
          </>
        ) : undefined
      }
    >
      {stage < 0 ? (
        <div className="grid gap-4">
          <div className="flex items-center gap-4 rounded-lg bg-card p-3">
            {draft.image ? <img src={draft.image.dataUrl} alt="" className="h-[72px] w-[72px] rounded-xl object-cover" /> : <CoinArt image={{ kind: 'art', seed: 1 }} size={72} />}
            <div className="min-w-0">
              <div className="text-lg font-bold text-ink">{draft.name}</div>
              <div className="mono text-ink-mute">${draft.ticker}</div>
              {draft.description && <p className="mt-1 line-clamp-2 text-[13px] text-ink-soft">{draft.description}</p>}
            </div>
          </div>
          <div className="inset divide-y divide-line/40 px-3">
            <KV k="Recipient" v={recipLabel} />
            <KV k="Demo wallet (developer)" v={wallet ? shortAddr(wallet.wallet, 6, 6) : '—'} mono />
            {recipient.kind === 'server' && <KV k="Announcement channel" v={`#${draft.channel}`} />}
            {recipient.kind === 'server' && <KV k="Treasury" v={s.claims[recipient.serverId] ? <span className="text-mint-bright">Claimed</span> : <span className="text-gold">Unclaimed — payouts locked until claimed</span>} />}
            <KV k="Payout message" v={draft.message || <span className="text-ink-dim">None</span>} />
            <KV k="Socials" v={[draft.x && 'X', draft.discord && 'Discord', draft.website && 'Website'].filter(Boolean).join(' · ') || <span className="text-ink-dim">None</span>} />
          </div>
          <div className="inset divide-y divide-line/40 px-3">
            <KV k="Demo dev buy" v={solLabel(devBuy)} />
            <KV k="Simulated network fee" v="0 SOL (simulated)" />
            <KV k="Platform share of creator fees" v="10% (floor, in lamports)" />
            <KV k="Recipient share of creator fees" v={<span className="text-mint-bright">90%</span>} />
            <KV k="Example: 1 SOL in fees" v={`${sol(900_000_000)} SOL → recipient · ${sol(100_000_000)} SOL → ~${compact(dcmPerFee)} $DCM burn`} />
          </div>
          <Notice>This creates a launch record in your browser only. Sample amounts and fee events are not real.</Notice>
        </div>
      ) : (
        <div className="grid gap-4">
          <ol className="grid gap-2" aria-live="polite">
            {STAGES.map((label, i) => {
              const state = failedAt === i ? 'fail' : i < stage || stage >= STAGES.length ? 'done' : i === stage && failedAt === null ? 'run' : 'wait';
              return (
                <li key={label} className={cx('flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[14px] transition-colors', state === 'run' ? 'border-blurple/50 bg-blurple/10' : state === 'fail' ? 'border-danger/50 bg-danger/10' : 'border-line/50 bg-card')}>
                  <span className={cx('inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full', state === 'done' ? 'bg-mint text-white' : state === 'fail' ? 'bg-danger text-white' : state === 'run' ? 'text-blurple-light' : 'bg-rail text-ink-dim')}>
                    {state === 'done' ? <Icon name="check" size={13} strokeWidth={3} /> : state === 'fail' ? <Icon name="x" size={13} strokeWidth={3} /> : state === 'run' ? <Spinner size={18} /> : <span className="text-[11px] font-bold">{i + 1}</span>}
                  </span>
                  <span className={cx('flex-1', state === 'wait' ? 'text-ink-mute' : 'text-ink')}>{label}</span>
                  {state === 'done' && <span className="text-[12px] text-mint-bright">Done</span>}
                </li>
              );
            })}
          </ol>
          {failedAt !== null && (
            <Notice tone="error">
              <b className="text-ink">Simulated failure while “{STAGES[failedAt]}”.</b> No record was created and nothing was charged. Retry to continue from this step, or go back to edit.
            </Notice>
          )}
          {stage >= STAGES.length && <Notice tone="success">Launch record saved locally. Opening its detail page…</Notice>}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------- Flywheel -------------------------------- */

function Flywheel() {
  const s = useDemo();
  const ui = useUI();
  const p = platformTotals(s);
  const steps = [
    { n: 1, t: 'Collect the 10% platform share', v: solLabel(p.revenue, 3), sub: 'collected from sample fee events', icon: 'coins' as const },
    { n: 2, t: 'Simulate a $DCM buyback', v: solLabel(p.spent, 3), sub: `spent across ${p.count} demo buybacks`, icon: 'refresh' as const },
    { n: 3, t: 'Burn the sample tokens', v: `${int(p.burned)} $DCM`, sub: `at a sample ${int(SAMPLE_DCM_PER_SOL)} $DCM/SOL`, icon: 'flame' as const },
  ];
  return (
    <section className="card relative mt-14 overflow-hidden">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blurple/20 blur-3xl" />
      <div className="relative grid gap-6 p-6 md:grid-cols-[260px_1fr] md:p-8">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-blurple-light">The $DCM flywheel</div>
          <div className="mt-2 text-[72px] font-black leading-none tracking-[-0.05em] text-ink">100%</div>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">In this demo, platform revenue funds simulated $DCM buybacks &amp; burns.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary btn-sm" onClick={() => ui.open('history')}>
              <Icon name="flame" size={14} /> View demo history
            </button>
            <span className="text-[12px] text-ink-mute">
              {solLabel(p.available, 3)} <span className="text-ink-dim">awaiting next buyback</span>
            </span>
          </div>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map((st, i) => (
            <li key={st.n} className="relative rounded-xl border border-line/50 bg-deep p-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blurple/15 text-blurple-light">
                  <Icon name={st.icon} size={16} />
                </span>
                <span className="text-[11px] font-bold text-ink-dim">STEP {st.n}</span>
              </div>
              <div className="mt-3 text-[13.5px] font-semibold text-ink">{st.t}</div>
              <div className="mt-2 text-[19px] font-bold tracking-tight text-ink">{st.v}</div>
              <div className="text-[11.5px] text-ink-mute">{st.sub}</div>
              {i < 2 && <Icon name="chevronRight" size={18} className="absolute -right-[15px] top-1/2 hidden -translate-y-1/2 text-ink-dim sm:block" />}
            </li>
          ))}
        </ol>
      </div>
      <div className="relative border-t border-black/20 bg-deep/50 px-6 py-2.5 text-[11.5px] text-ink-dim md:px-8">Counters derived from the sample ledger · sample exchange rate · no real tokens.</div>
    </section>
  );
}
