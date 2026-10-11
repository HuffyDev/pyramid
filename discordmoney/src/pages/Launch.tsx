import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, XGlyph } from '../components/Icon';
import { LaunchCard } from '../components/launch';
import { Modal } from '../components/Overlay';
import { useToast } from '../components/Toast';
import { useUI } from '../components/UIState';
import { CoinImage, Empty, Field, KV, Notice, Segmented, ServerIcon, Spinner, cx } from '../components/ui';
import { createLaunch } from '../lib/actions';
import { int, shortAddr, solLabel, solToLamports } from '../lib/format';
import { platformTotals } from '../lib/ledger';
import { useApp } from '../lib/store';
import type { Recipient } from '../lib/types';
import { DISCORD_ID_RE, LINK_RE, isSolanaAddress, toThumbnail, validateImage, validateSocial } from '../lib/validate';

/* ---------------------------------- Draft --------------------------------- */

interface Draft {
  image: { dataUrl: string; name: string; size: number } | null;
  name: string;
  ticker: string;
  description: string;
  mode: 'member' | 'server';
  memberName: string;
  memberId: string;
  memberWallet: string;
  serverId: string;
  serverName: string;
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
  memberName: '',
  memberId: '',
  memberWallet: '',
  serverId: '',
  serverName: '',
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

type Key = 'image' | 'name' | 'ticker' | 'description' | 'memberName' | 'memberId' | 'memberWallet' | 'serverId' | 'serverName' | 'channel' | 'message' | 'devBuy' | 'x' | 'discord' | 'website';
type Errors = Partial<Record<Key, string>>;

function validate(d: Draft): Errors {
  const e: Errors = {};
  if (!d.image) e.image = 'Add a coin image.';
  if (!d.name.trim()) e.name = 'Name is required.';
  else if (d.name.length > 32) e.name = 'Maximum 32 characters.';
  if (!d.ticker) e.ticker = 'Ticker is required.';
  else if (d.ticker.length > 10) e.ticker = 'Maximum 10 characters.';
  else if (!/^[A-Z0-9]+$/.test(d.ticker)) e.ticker = 'Letters and numbers only.';
  if (d.description.length > 280) e.description = 'Maximum 280 characters.';
  if (d.mode === 'member') {
    const u = d.memberName.trim().replace(/^@/, '');
    if (!u) e.memberName = 'Enter the Discord username.';
    else if (!/^[a-z0-9._]{2,32}$/i.test(u)) e.memberName = 'Usernames are 2–32 letters, numbers, dots or underscores.';
    if (d.memberId && !DISCORD_ID_RE.test(d.memberId)) e.memberId = 'User IDs are 17–20 digits.';
    if (!d.memberWallet.trim()) e.memberWallet = 'Enter the Solana wallet that receives payouts.';
    else if (!isSolanaAddress(d.memberWallet)) e.memberWallet = 'That is not a valid Solana address.';
  } else {
    if (!DISCORD_ID_RE.test(d.serverId)) e.serverId = 'Choose a server or enter its 17–20 digit server ID.';
    if (!d.serverName.trim()) e.serverName = 'Enter the server name.';
    if (!/^[a-z0-9_-]{1,100}$/.test(d.channel)) e.channel = 'Use the channel name without #, e.g. announcements.';
  }
  if (d.message.length > 80) e.message = 'Maximum 80 characters.';
  else if (LINK_RE.test(d.message)) e.message = 'Links are not allowed in payout messages.';
  const lam = solToLamports(d.devBuy);
  if (lam === null) e.devBuy = 'Enter a number like 0.5';
  else if (lam > 10 * 1e9) e.devBuy = 'Maximum dev buy is 10 SOL.';
  for (const k of ['x', 'discord', 'website'] as const) {
    const err = validateSocial(k, d[k]);
    if (err) e[k] = err;
  }
  return e;
}

/* ---------------------------------- Page ---------------------------------- */

export default function LaunchPage() {
  const s = useApp();
  const recent = useMemo(() => [...s.data.launches].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6), [s.data.launches]);
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
        {s.status === 'loading' ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-[188px] rounded-xl" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <Empty icon="rocket" title="No launches yet" body="Be the first to launch a community coin." action={<a href="#launch-form" className="btn-primary btn-sm">Launch a coin</a>} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((l) => (
              <LaunchCard key={l.id} data={s.data} launch={l} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Hero() {
  const steps = [
    { t: 'Launch a coin', d: 'Create a community token with a name, ticker and image.', icon: 'rocket' as const },
    { t: 'Route creator fees', d: 'Allocate fees to a member or a server treasury.', icon: 'coins' as const },
    { t: 'Notify your community', d: 'Payout updates are posted in Discord.', icon: 'bell' as const },
  ];
  return (
    <div className="lg:sticky lg:top-24 lg:pt-6">
      <div className="inline-flex items-center gap-2 rounded-full border border-blurple/30 bg-blurple/10 px-3 py-1 text-[12.5px] font-medium text-blurple-pale">
        <Icon name="flame" size={13} className="text-[#F68BC4]" />
        Platform fees → $DP buybacks &amp; burns
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
              <span className="absolute -right-1.5 -top-1.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-card bg-ink text-[10px] font-black text-rail">{i + 1}</span>
            </span>
            <span>
              <span className="block text-[15px] font-semibold text-ink">{st.t}</span>
              <span className="block text-[13px] text-ink-mute">{st.d}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-5 max-w-[480px] text-[12.5px] leading-relaxed text-ink-dim">
        Discord is the identity and notification layer. Payouts go to the recipient’s linked Solana wallet.
      </p>
    </div>
  );
}

/* ---------------------------------- Form ---------------------------------- */

function LaunchForm() {
  const s = useApp();
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
  const wallet = s.wallet;
  const guilds = s.discord?.guilds ?? [];

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* draft is best-effort */
    }
  }, [d]);

  const errors = validate(d);
  const show = (k: Key) => (submitted || touched[k] ? errors[k] : undefined);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const blur = (k: Key) => () => setTouched((t) => ({ ...t, [k]: true }));
  const claim = d.serverId ? s.data.claims[d.serverId] : undefined;
  const knownGuild = guilds.find((g) => g.id === d.serverId);

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
      ui.open('connect');
      return;
    }
    setSubmitted(true);
    const keys = Object.keys(errors) as Key[];
    if (keys.length) {
      if (keys[0] === 'x' || keys[0] === 'discord' || keys[0] === 'website') set('socialsOpen', true);
      window.setTimeout(() => {
        const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${keys[0]}"]`);
        el?.focus();
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 30);
      toast.error('Check the highlighted fields', `${keys.length} field(s) need attention.`);
      return;
    }
    setReview(true);
  }

  const recipient: Recipient =
    d.mode === 'member'
      ? { kind: 'member', username: d.memberName.trim().replace(/^@/, ''), discordId: d.memberId || undefined, wallet: d.memberWallet.trim() }
      : { kind: 'server', serverId: d.serverId, serverName: d.serverName.trim(), iconUrl: knownGuild?.iconUrl, channel: d.channel };
  const devBuyLam = solToLamports(d.devBuy) ?? 0;
  const recipientLabel = d.mode === 'member' ? (d.memberName ? `@${d.memberName.replace(/^@/, '')}` : 'the member') : d.serverName ? `${d.serverName} treasury` : 'the server treasury';

  return (
    <div id="launch-form" className="card relative scroll-mt-24 overflow-hidden shadow-glow">
      <div className="flex items-center justify-between border-b border-black/20 bg-deep/60 px-5 py-3.5">
        <div>
          <h2 className="text-[15px] font-bold text-ink">Create a coin</h2>
          <p className="text-[12px] text-ink-mute">Launches on pump.fun</p>
        </div>
        {wallet ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/15 px-2.5 py-1 text-[11.5px] font-semibold text-mint-bright">
            <span className="h-1.5 w-1.5 rounded-full bg-mint-bright" /> {shortAddr(wallet.address)}
          </span>
        ) : (
          <button type="button" onClick={() => ui.open('connect')} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11.5px] font-semibold text-ink-soft hover:bg-white/10">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-dim" /> Not connected
          </button>
        )}
      </div>
      <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-4 p-5">
        <Field label="Coin image" error={imgErr ?? show('image')} hint="PNG, JPG, GIF or WebP · max 4MB">
          {d.image ? (
            <div className="flex items-center gap-3 rounded-lg border border-line/60 bg-input p-2.5">
              <img src={d.image.dataUrl} alt="Coin preview" className="h-16 w-16 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-ink">{d.image.name}</div>
                <div className="text-[12px] text-ink-mute">{(d.image.size / 1024).toFixed(0)} KB</div>
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
            <input id="f-name" data-field="name" className={cx('input', show('name') && 'input-error')} value={d.name} maxLength={32} placeholder="Guild Cat" onChange={(e) => set('name', e.target.value)} onBlur={blur('name')} aria-invalid={Boolean(show('name'))} />
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
          <textarea id="f-desc" data-field="description" className={cx('input min-h-[76px] resize-y', show('description') && 'input-error')} value={d.description} maxLength={280} placeholder="What is this coin about? Who does it support?" onChange={(e) => set('description', e.target.value)} onBlur={blur('description')} />
        </Field>

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
          <div className="grid gap-3 rounded-lg border border-blurple/45 bg-blurple/[0.07] p-3 shadow-[inset_3px_0_0_#5865F2]">
            {d.mode === 'member' ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Discord username" htmlFor="f-mname" error={show('memberName')}>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim">@</span>
                      <input id="f-mname" data-field="memberName" className={cx('input !pl-7', show('memberName') && 'input-error')} value={d.memberName} placeholder="username" autoCapitalize="none" spellCheck={false} onChange={(e) => set('memberName', e.target.value.replace(/^@/, ''))} onBlur={blur('memberName')} />
                    </div>
                  </Field>
                  <Field label="User ID (optional)" htmlFor="f-mid" error={show('memberId')}>
                    <input id="f-mid" data-field="memberId" inputMode="numeric" className={cx('input mono !text-[13px]', show('memberId') && 'input-error')} value={d.memberId} placeholder="17–20 digits" onChange={(e) => set('memberId', e.target.value.replace(/\D/g, '').slice(0, 20))} onBlur={blur('memberId')} />
                  </Field>
                </div>
                <Field label="Payout wallet (Solana)" htmlFor="f-mwallet" error={show('memberWallet')} hint="Creator-fee payouts are sent here.">
                  <div className="flex gap-2">
                    <input id="f-mwallet" data-field="memberWallet" className={cx('input mono !text-[13px]', show('memberWallet') && 'input-error')} value={d.memberWallet} placeholder="Wallet address" spellCheck={false} autoCapitalize="none" onChange={(e) => set('memberWallet', e.target.value.trim())} onBlur={blur('memberWallet')} />
                    {wallet && d.memberWallet !== wallet.address && (
                      <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => set('memberWallet', wallet.address)}>
                        Use mine
                      </button>
                    )}
                  </div>
                </Field>
              </>
            ) : (
              <>
                {guilds.length > 0 && (
                  <Field label="Your servers" htmlFor="f-guild">
                    <select
                      id="f-guild"
                      className="input !py-2"
                      value={knownGuild ? knownGuild.id : ''}
                      onChange={(e) => {
                        const g = guilds.find((x) => x.id === e.target.value);
                        setD((x) => ({ ...x, serverId: g?.id ?? '', serverName: g?.name ?? '' }));
                      }}
                    >
                      <option value="">Enter a server manually…</option>
                      {guilds.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                          {g.canManage ? ' (admin)' : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Server ID" htmlFor="f-sid" error={show('serverId')}>
                    <input id="f-sid" data-field="serverId" inputMode="numeric" className={cx('input mono !text-[13px]', show('serverId') && 'input-error')} value={d.serverId} placeholder="17–20 digits" onChange={(e) => set('serverId', e.target.value.replace(/\D/g, '').slice(0, 20))} onBlur={blur('serverId')} />
                  </Field>
                  <Field label="Server name" htmlFor="f-sname" error={show('serverName')}>
                    <input id="f-sname" data-field="serverName" className={cx('input', show('serverName') && 'input-error')} value={d.serverName} placeholder="My Server" onChange={(e) => set('serverName', e.target.value)} onBlur={blur('serverName')} />
                  </Field>
                </div>
                <Field label="Announcement channel" htmlFor="f-chan" error={show('channel')}>
                  <div className="relative">
                    <Icon name="hash" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" />
                    <input id="f-chan" data-field="channel" className={cx('input !pl-8', show('channel') && 'input-error')} value={d.channel} placeholder="announcements" onChange={(e) => set('channel', e.target.value.toLowerCase().replace(/^#/, '').replace(/\s+/g, '-'))} onBlur={blur('channel')} />
                  </div>
                </Field>
                {d.serverId && (
                  <div className="flex items-center gap-3 text-[12.5px]">
                    <ServerIcon name={d.serverName || 'Server'} iconUrl={knownGuild?.iconUrl} id={d.serverId} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-ink">{d.serverName || 'Server'}</div>
                      <div className="mono truncate text-ink-mute">ID {d.serverId}</div>
                    </div>
                    {claim ? (
                      <div className="text-right">
                        <div className="inline-flex items-center gap-1 font-semibold text-mint-bright">
                          <Icon name="check" size={12} /> Treasury claimed
                        </div>
                        <div className="mono text-ink-mute">{shortAddr(claim.wallet)}</div>
                      </div>
                    ) : (
                      <div className="text-right">
                        <div className="inline-flex items-center gap-1 font-semibold text-gold">
                          <Icon name="lock" size={12} /> Unclaimed
                        </div>
                        <Link to="/claim" className="link block text-[11.5px]">
                          Claim server →
                        </Link>
                      </div>
                    )}
                  </div>
                )}
                {d.serverId && !claim && <p className="text-[11.5px] text-ink-mute">Fees accrue right away; payouts start once a server admin claims the treasury.</p>}
              </>
            )}
          </div>
        </div>

        <Field label="Payout message (optional)" htmlFor="f-msg" error={show('message')} hint="Posted with each payout announcement. No links." right={<Counter n={d.message.length} max={80} />}>
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

        <Field label="Dev buy (optional)" htmlFor="f-buy" error={show('devBuy')} hint="Buy your own coin at launch · max 10 SOL">
          <div className="relative">
            <input id="f-buy" data-field="devBuy" inputMode="decimal" className={cx('input !pr-14', show('devBuy') && 'input-error')} value={d.devBuy} onChange={(e) => set('devBuy', e.target.value.replace(',', '.'))} onBlur={blur('devBuy')} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-mute">SOL</span>
          </div>
        </Field>

        <div className="rounded-lg border border-line/60">
          <button type="button" className="flex w-full items-center justify-between px-3 py-2.5 text-[13.5px] font-medium text-ink-body hover:bg-hover" aria-expanded={d.socialsOpen} onClick={() => set('socialsOpen', !d.socialsOpen)}>
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
              <SocialInput icon={<Icon name="globe" size={14} />} label="Website URL" field="website" value={d.website} placeholder="https://yourcoin.com" error={show('website')} onChange={(v) => set('website', v)} onBlur={blur('website')} />
            </div>
          )}
        </div>

        <div className="inset grid gap-1 p-3 text-[13px]">
          <div className="flex justify-between gap-2">
            <span className="text-ink-mute">Platform fee</span>
            <span className="font-semibold text-ink">10% of creator fees</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="shrink-0 text-ink-mute">Recipient share</span>
            <span className="truncate font-semibold text-mint-bright">90% → {recipientLabel}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-ink-mute">Dev buy</span>
            <span className="font-semibold text-ink">{solLabel(devBuyLam)}</span>
          </div>
        </div>

        <button type="submit" className="btn-primary h-11 w-full text-[15px] font-semibold">
          {wallet ? (
            <>
              Review launch <Icon name="arrowRight" size={16} />
            </>
          ) : (
            <>
              <Icon name="wallet" size={16} /> Connect wallet
            </>
          )}
        </button>
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

function ReviewModal({ open, onClose, draft, recipient, devBuy, onDone }: { open: boolean; onClose: () => void; draft: Draft; recipient: Recipient; devBuy: number; onDone: () => void }) {
  const s = useApp();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function submit() {
    if (running.current) return; // duplicate-submit guard
    running.current = true;
    setBusy(true);
    setError(null);
    const r = await createLaunch({
      name: draft.name.trim(),
      ticker: draft.ticker,
      description: draft.description.trim(),
      image: draft.image!.dataUrl,
      recipient,
      payoutMessage: draft.message.trim(),
      devBuy,
      socials: { x: draft.x.trim() || undefined, discord: draft.discord.trim() || undefined, website: draft.website.trim() || undefined },
    });
    running.current = false;
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onDone();
    onClose();
    toast.success(`${r.value.name} launched`, `$${r.value.ticker} is live.`);
    nav(`/launches/${r.value.id}`);
  }

  const recipLabel = recipient.kind === 'member' ? `@${recipient.username}` : `${recipient.serverName} treasury`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={busy}
      title={busy ? 'Launching…' : 'Review launch'}
      description={busy ? 'Approve the transaction in your wallet if prompted.' : 'Check everything before launching.'}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Back to edit
          </button>
          <button type="button" className="btn-primary" data-autofocus onClick={() => void submit()} disabled={busy}>
            {busy ? <Spinner size={15} /> : error ? <Icon name="refresh" size={14} /> : <Icon name="rocket" size={14} />} {busy ? 'Launching…' : error ? 'Try again' : 'Launch coin'}
          </button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex items-center gap-4 rounded-lg bg-card p-3">
          <CoinImage src={draft.image?.dataUrl} name={draft.name} size={72} />
          <div className="min-w-0">
            <div className="text-lg font-bold text-ink">{draft.name}</div>
            <div className="mono text-ink-mute">${draft.ticker}</div>
            {draft.description && <p className="mt-1 line-clamp-2 text-[13px] text-ink-soft">{draft.description}</p>}
          </div>
        </div>
        <div className="inset divide-y divide-line/40 px-3">
          <KV k="Recipient" v={recipLabel} />
          {recipient.kind === 'member' && <KV k="Payout wallet" v={shortAddr(recipient.wallet, 6, 6)} mono />}
          {recipient.kind === 'server' && <KV k="Announcement channel" v={`#${recipient.channel}`} />}
          {recipient.kind === 'server' && <KV k="Treasury" v={s.data.claims[recipient.serverId] ? <span className="text-mint-bright">Claimed</span> : <span className="text-gold">Unclaimed — payouts start after claim</span>} />}
          <KV k="Your wallet" v={s.wallet ? shortAddr(s.wallet.address, 6, 6) : '—'} mono />
          <KV k="Payout message" v={draft.message || <span className="text-ink-dim">None</span>} />
          <KV k="Socials" v={[draft.x && 'X', draft.discord && 'Discord', draft.website && 'Website'].filter(Boolean).join(' · ') || <span className="text-ink-dim">None</span>} />
        </div>
        <div className="inset divide-y divide-line/40 px-3">
          <KV k="Dev buy" v={solLabel(devBuy)} />
          <KV k="Platform share of creator fees" v="10%" />
          <KV k="Recipient share of creator fees" v={<span className="text-mint-bright">90%</span>} />
        </div>
        {error && (
          <Notice tone="error">
            <b className="text-ink">Launch failed.</b> {error}
          </Notice>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------- Flywheel -------------------------------- */

function Flywheel() {
  const s = useApp();
  const ui = useUI();
  const p = platformTotals(s.data);
  const steps = [
    { n: 1, t: 'Collect the 10% platform share', v: solLabel(p.revenue, 3), sub: 'from creator fees', icon: 'coins' as const },
    { n: 2, t: 'Buy back $DP', v: solLabel(p.spent, 3), sub: `across ${p.count} buyback${p.count === 1 ? '' : 's'}`, icon: 'refresh' as const },
    { n: 3, t: 'Burn the tokens', v: `${int(p.burned)} $DP`, sub: 'burned to date', icon: 'flame' as const },
  ];
  return (
    <section className="card relative mt-14 overflow-hidden">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blurple/20 blur-3xl" />
      <div className="relative grid grid-cols-1 gap-6 p-6 md:grid-cols-[260px_1fr] md:p-8">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-blurple-light">The $DP flywheel</div>
          <div className="mt-2 text-[72px] font-black leading-none tracking-[-0.05em] text-ink">100%</div>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">of platform revenue funds $DP buybacks &amp; burns.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary btn-sm" onClick={() => ui.open('history')}>
              <Icon name="flame" size={14} /> Buyback history
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
    </section>
  );
}
