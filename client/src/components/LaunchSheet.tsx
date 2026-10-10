import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  DESC_MAX,
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  NAME_MAX,
  PRIORITY_PRESETS,
  TICKER_MAX,
  launchFieldsSchema,
  tradeParamsSchema,
  type LaunchView,
  type PriorityPreset,
} from '../../../shared/launch';
import { estimateCost, formatSol } from '../../../shared/fees';
import { checkLaunchFields } from '../../../shared/filter';
import { slotOf } from '../../../shared/pyramid';
import { useLaunch, type LaunchInput, type LaunchState, type StepId } from '../lib/launch';
import { useConfig } from '../lib/config';
import { useLockBody } from '../lib/hooks';
import { usePyramid } from '../lib/pyramid';
import { useWalletModal } from '../wallet/WalletModal';
import { short } from '../lib/format';
import { BrickTile } from './BrickTile';
import { ImageCropper } from './ImageCropper';
import { Icon, Spinner } from './Icon';
import { WalletButton } from './WalletButton';
import { SuccessDock } from './SuccessDock';

// ── context: open the sheet from anywhere; Home listens for landed bricks ──
interface Landed {
  launch: LaunchView;
  imageUrl: string | null;
}
interface Ctx {
  open: () => void;
  landed: Landed | null;
  clearLanded: () => void;
}
const SheetCtx = createContext<Ctx>({ open: () => {}, landed: null, clearLanded: () => {} });
export const useLaunchSheet = () => useContext(SheetCtx);

export function LaunchSheetProvider({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);
  const [landed, setLanded] = useState<Landed | null>(null);
  const open = useCallback(() => {
    setLanded(null);
    setShow(true);
  }, []);
  const clearLanded = useCallback(() => setLanded(null), []);
  return (
    <SheetCtx.Provider value={{ open, landed, clearLanded }}>
      {children}
      {/* kept mounted while open so an in-flight launch survives re-renders */}
      {show && (
        <LaunchSheet
          onClose={() => setShow(false)}
          onLanded={(l) => {
            setLanded(l);
            setShow(false);
          }}
        />
      )}
      {landed && <SuccessDock launch={landed.launch} imageUrl={landed.imageUrl} onClose={clearLanded} />}
    </SheetCtx.Provider>
  );
}

// ── form ──
const DRAFT_KEY = 'pyramid:draft:v1';
const RAW_MAX_BYTES = 15 * 1024 * 1024;

type Form = {
  name: string;
  ticker: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  devBuy: string;
  slippage: string;
  priority: PriorityPreset;
  customPriority: string;
};
const emptyForm: Form = { name: '', ticker: '', description: '', website: '', twitter: '', telegram: '', devBuy: '0', slippage: '10', priority: 'med', customPriority: '0.001' };

function loadDraft(): Form {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return d ? { ...emptyForm, ...d } : emptyForm;
  } catch {
    return emptyForm;
  }
}

let imgSeq = 0;
interface Img {
  blob: Blob;
  url: string;
  name: string;
  id: number;
}

function LaunchSheet({ onClose, onLanded }: { onClose: () => void; onLanded: (l: Landed) => void }) {
  useLockBody(true);
  const [f, setF] = useState<Form>(loadDraft);
  const [image, setImage] = useState<Img | null>(null);
  const [crop, setCrop] = useState<File | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const { publicKey } = useWallet();
  const { open: openWallet } = useWalletModal();
  const { dryRun, mockMode, launchesPaused } = useConfig();
  const { bricks } = usePyramid();
  const { state, run, reset, busy } = useLaunch();
  const scroller = useRef<HTMLDivElement>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(f));
    } catch {
      /* private mode */
    }
  }, [f]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !busy && !crop && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [busy, crop, onClose]);

  const priorityFeeSol = f.priority === 'custom' ? parseFloat(f.customPriority) || 0 : PRIORITY_PRESETS[f.priority];
  const devBuySol = parseFloat(f.devBuy) || 0;
  const slippagePct = parseFloat(f.slippage) || 0;

  const fields = launchFieldsSchema.safeParse({ name: f.name, ticker: f.ticker, description: f.description, website: f.website, twitter: f.twitter, telegram: f.telegram });
  const trade = tradeParamsSchema.safeParse({ devBuySol, slippagePct, priorityFeeSol });
  const filter = checkLaunchFields({ name: f.name, ticker: f.ticker, description: f.description });
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!fields.success) for (const i of fields.error.issues) e[String(i.path[0])] ??= i.message;
    if (!trade.success) for (const i of trade.error.issues) e[String(i.path[0])] ??= i.message;
    for (const [k, r] of Object.entries(filter.fields)) e[k] ??= `not allowed here (${r.join(', ')})`;
    if (f.devBuy.trim() === '' || Number.isNaN(Number(f.devBuy))) e.devBuySol = 'enter an amount (0 is fine)';
    if (!image) e.image = 'image required';
    return e;
  }, [fields, trade, filter, image, f.devBuy]);
  const valid = Object.keys(errors).length === 0;
  const cost = estimateCost({ devBuySol, priorityFeeSol });
  const formKey = JSON.stringify([f.name, f.ticker, f.description, f.website, f.twitter, f.telegram, f.devBuy, f.slippage, priorityFeeSol, image?.id]);
  const nextN = bricks.length + 1;

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return setImgError('Use PNG, JPG, WEBP or GIF.');
    if (file.size > RAW_MAX_BYTES) return setImgError('File is over 15 MB.');
    setImgError(null);
    if (file.type === 'image/gif') {
      if (file.size > IMAGE_MAX_BYTES) return setImgError('GIFs must be under 4 MB (they are not re-encoded).');
      return setImage({ blob: file, url: URL.createObjectURL(file), name: file.name, id: ++imgSeq });
    }
    setCrop(file);
  };

  const submit = () => {
    setSubmitted(true);
    if (busy) return;
    if (!valid || !fields.success || !trade.success || !image) {
      scroller.current?.querySelector('[data-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!publicKey) return openWallet();
    const input: LaunchInput = { formKey, fields: fields.data, trade: trade.data, image: { blob: image.blob, name: image.name } };
    run(input);
  };

  // success → close the sheet and let the brick drop into the pyramid
  useEffect(() => {
    if (state.status !== 'done' || !state.result) return;
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => onLanded({ launch: state.result!.launch, imageUrl: image?.url ?? null }), 900);
    return () => clearTimeout(t);
  }, [state.status, state.result, onLanded, image]);

  const err = (k: string) => (submitted ? errors[k] : undefined);
  const live = (k: string, raw: string) => (raw ? errors[k] : undefined) ?? err(k);
  const phase = state.status === 'idle' ? 'form' : 'progress';
  const cta = busy ? 'Laying…' : !publicKey ? 'Connect wallet' : dryRun ? 'Lay a brick (dry run)' : 'Lay a brick';

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal aria-label="Lay a brick">
      <button className="absolute inset-0 animate-fade bg-night-950/75 backdrop-blur-md" onClick={busy ? undefined : onClose} aria-label="Close" tabIndex={-1} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[94svh] animate-sheet flex-col overflow-hidden rounded-t-[28px] border-t border-sand-50/10 bg-night-850 shadow-sheet md:inset-4 md:max-h-none md:animate-rise md:rounded-[28px] md:border">
        {/* glow from above */}
        <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[640px] -translate-x-1/2 rounded-full bg-gold/10 blur-3xl" />
        {/* header */}
        <div className="relative flex shrink-0 items-center gap-3 border-b border-sand-50/[0.07] px-5 pb-3 pt-2 md:px-8 md:py-5">
          <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-sand-50/15 md:hidden" />
          <div className="mt-3 md:mt-0">
            <div className="eyebrow">brick #{nextN} · {dryRun ? 'dry run' : 'mainnet'}</div>
            <h2 className="display mt-1 text-2xl md:text-3xl">lay a brick.</h2>
          </div>
          <div className="ml-auto mt-3 flex items-center gap-2 md:mt-0">
            <div className="hidden sm:block">
              <WalletButton compact />
            </div>
            <button className="btn-quiet p-2" onClick={onClose} disabled={busy} aria-label="Close">
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>

        {dryRun && (
          <div className="relative flex shrink-0 items-center gap-2 border-b border-gold/20 bg-gold/[0.07] px-5 py-2 text-[12.5px] text-gold-hot md:px-8">
            <Icon name="alert" size={14} />
            <span>
              <b className="font-semibold">DRY RUN</b> — the transaction is built and {mockMode ? 'simulated (or mocked offline)' : 'simulated'}, never broadcast. Your brick is a practice brick.
            </span>
          </div>
        )}

        <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto grid max-w-[1200px] gap-8 px-5 py-6 md:grid-cols-[minmax(0,1fr)_380px] md:gap-12 md:px-8 md:py-8">
            {/* preview first on mobile */}
            <aside className="md:order-2">
              <div className="md:sticky md:top-0 md:space-y-5">
                <Preview f={f} image={image?.url} n={nextN} creator={publicKey?.toBase58()} />
                <div className="hidden md:block">
                  <CostSummary cost={cost} />
                </div>
              </div>
            </aside>

            <fieldset className="space-y-9 md:order-1" disabled={busy}>
              <Block n="I" title="Name it" sub="Shown on the brick and on pump.fun.">
                <div className="grid gap-4 sm:grid-cols-[1fr_190px]">
                  <Field label="Name" count={`${f.name.length}/${NAME_MAX}`} error={live('name', f.name)}>
                    <input className="field" data-invalid={!!live('name', f.name)} value={f.name} maxLength={NAME_MAX} onChange={(e) => set('name', e.target.value)} placeholder="Sand Cat" autoComplete="off" />
                  </Field>
                  <Field label="Ticker" count={`${f.ticker.length}/${TICKER_MAX}`} error={live('ticker', f.ticker)}>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-gold">$</span>
                      <input
                        className="field pl-7 font-mono uppercase"
                        data-invalid={!!live('ticker', f.ticker)}
                        value={f.ticker}
                        maxLength={TICKER_MAX}
                        onChange={(e) => set('ticker', e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                        placeholder="SCAT"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                      />
                    </div>
                  </Field>
                </div>
                <Field label="Description" count={`${f.description.length}/${DESC_MAX}`} error={live('description', f.description)} className="mt-4">
                  <textarea
                    className="field min-h-[96px] resize-y leading-relaxed"
                    data-invalid={!!live('description', f.description)}
                    value={f.description}
                    maxLength={DESC_MAX}
                    onChange={(e) => set('description', e.target.value)}
                    placeholder="one more stone for the monument."
                  />
                </Field>
              </Block>

              <Block n="II" title="Carve the face" sub="Square image, cropped here. It is the face of your brick.">
                <div className="flex items-start gap-4" data-invalid={!!(imgError ?? err('image'))}>
                  <Drop url={image?.url} onFile={pickFile} onClear={() => setImage(null)} error={!!(imgError ?? err('image'))} />
                  <div className="min-w-0 flex-1 pt-1 text-sm text-sand-300">
                    <p>PNG, JPG, WEBP or GIF. You'll crop it to a square.</p>
                    <p className="mt-1 text-[12.5px] text-sand-400">Max 4 MB after crop. GIFs are kept as-is.</p>
                    {image && (
                      <button type="button" className="mt-3 text-[13px] text-gold hover:text-gold-hot" onClick={() => setCrop(new File([image.blob], image.name, { type: image.blob.type }))}>
                        Re-crop
                      </button>
                    )}
                    {(imgError ?? err('image')) && <p className="mt-2 text-xs text-bad">{imgError ?? err('image')}</p>}
                  </div>
                </div>
              </Block>

              <Block n="III" title="Links" sub="Optional. Shown on pump.fun and your brick page.">
                <div className="grid gap-3 sm:grid-cols-3">
                  <LinkField icon="xlogo" label="X" value={f.twitter} onChange={(v) => set('twitter', v)} placeholder="https://x.com/…" error={live('twitter', f.twitter)} />
                  <LinkField icon="telegram" label="Telegram" value={f.telegram} onChange={(v) => set('telegram', v)} placeholder="https://t.me/…" error={live('telegram', f.telegram)} />
                  <LinkField icon="globe" label="Website" value={f.website} onChange={(v) => set('website', v)} placeholder="https://" error={live('website', f.website)} />
                </div>
              </Block>

              <Block n="IV" title="Mortar" sub="Your first buy happens in the same transaction as the create.">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Dev buy" error={live('devBuySol', f.devBuy)}>
                    <div className="relative">
                      <input className="field pr-14 font-mono" data-invalid={!!live('devBuySol', f.devBuy)} inputMode="decimal" value={f.devBuy} onChange={(e) => set('devBuy', e.target.value.replace(',', '.'))} placeholder="0" />
                      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-xs text-sand-400">SOL</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {['0', '0.1', '0.5', '1', '2'].map((v) => (
                        <Chip key={v} active={f.devBuy === v} onClick={() => set('devBuy', v)}>
                          {v === '0' ? 'none' : v}
                        </Chip>
                      ))}
                    </div>
                  </Field>
                  <Field label="Slippage" error={live('slippagePct', f.slippage)}>
                    <div className="relative">
                      <input className="field pr-10 font-mono" inputMode="decimal" value={f.slippage} onChange={(e) => set('slippage', e.target.value.replace(',', '.'))} />
                      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-xs text-sand-400">%</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {['5', '10', '15', '25'].map((v) => (
                        <Chip key={v} active={f.slippage === v} onClick={() => set('slippage', v)}>
                          {v}%
                        </Chip>
                      ))}
                    </div>
                  </Field>
                </div>
                <div className="mt-5">
                  <div className="label">
                    <span>Priority fee</span>
                    <span className="num normal-case tracking-normal text-sand-200">{formatSol(priorityFeeSol)} SOL</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 rounded-xl border border-sand-50/10 bg-night-950/60 p-1">
                    {(['low', 'med', 'high', 'custom'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => set('priority', p)}
                        className={`rounded-lg px-2 py-2 text-center transition ${f.priority === p ? 'bg-sand-50/[0.08] text-sand-50 ring-1 ring-gold/40' : 'text-sand-400 hover:text-sand-100'}`}
                      >
                        <div className="text-sm font-medium capitalize">{p}</div>
                        <div className="num text-[10.5px] text-sand-400">{p === 'custom' ? 'set' : formatSol(PRIORITY_PRESETS[p])}</div>
                      </button>
                    ))}
                  </div>
                  {f.priority === 'custom' && (
                    <Field label="" error={live('priorityFeeSol', f.customPriority)} className="mt-3">
                      <div className="relative">
                        <input className="field pr-14 font-mono" inputMode="decimal" value={f.customPriority} onChange={(e) => set('customPriority', e.target.value.replace(',', '.'))} autoFocus />
                        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-xs text-sand-400">SOL</span>
                      </div>
                    </Field>
                  )}
                </div>
              </Block>

              <div className="md:hidden">
                <CostSummary cost={cost} />
              </div>
            </fieldset>
          </div>
        </div>

        {/* action bar */}
        <div className="relative shrink-0 border-t border-sand-50/[0.07] bg-night-900/90 px-5 pt-3 backdrop-blur-xl safe-b md:px-8 md:py-4">
          {phase === 'progress' ? (
            <Progress
              state={state}
              dryRun={dryRun}
              onRetry={submit}
              onBack={reset}
            />
          ) : (
            <div className="mx-auto flex max-w-[1200px] items-center gap-4">
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-sand-400">you pay ≈</div>
                <div className="num text-lg text-sand-50">
                  {formatSol(cost.total, 4)} <span className="text-xs text-sand-400">SOL</span>
                </div>
              </div>
              <div className="ml-auto flex flex-col items-end">
                <button className="btn-gold min-w-[200px] py-3.5 text-[15px]" onClick={submit} disabled={busy || !!launchesPaused}>
                  <Icon name={publicKey ? 'pyramid' : 'wallet'} />
                  {cta}
                </button>
                {launchesPaused ? (
                  <span className="mt-1.5 max-w-[320px] text-right text-xs text-bad">{launchesPaused}</span>
                ) : (
                  submitted && !valid && <span className="mt-1.5 text-xs text-bad">fix the highlighted fields first</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {crop && (
        <ImageCropper
          file={crop}
          aspect={1}
          outWidth={1000}
          title="Crop your brick's face"
          onCancel={() => setCrop(null)}
          onDone={(blob, url) => {
            const ext = blob.type === 'image/png' ? 'png' : 'jpg';
            if (blob.size > IMAGE_MAX_BYTES) setImgError('Cropped image is over 4 MB — try a smaller source.');
            else setImage({ blob, url, name: `brick.${ext}`, id: ++imgSeq });
            setCrop(null);
          }}
        />
      )}
    </div>
  );
}

// ── pieces ──

function Preview({ f, image, n, creator }: { f: Form; image?: string; n: number; creator?: string }) {
  const [w, setW] = useState(300);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.min(340, el.clientWidth - 48)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative overflow-hidden rounded-2xl border border-sand-50/[0.08] bg-gradient-to-b from-night-750 to-night-900">
      <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-64 -translate-x-1/2 rounded-full bg-gold/15 blur-3xl" />
      <div className="relative flex items-center justify-between px-4 pt-3">
        <span className="eyebrow">your brick</span>
        <span className="font-mono text-[11px] text-sand-400">#{n}</span>
      </div>
      <div className="relative flex justify-center px-6 pb-2 pt-5 md:pb-4 md:pt-8">
        <div className="drop-shadow-[0_18px_30px_rgba(0,0,0,0.55)]">
          <BrickTile width={w} data={{ ticker: f.ticker, mint: f.ticker || 'preview', image: image ?? null, mcap: null, n, caption: f.name ? f.name.slice(0, 18) : 'your coin' }} />
        </div>
      </div>
      <div className="relative h-3 bg-gradient-to-b from-sand-600/40 to-transparent" />
      <div className="relative flex items-center justify-between px-4 py-3 font-mono text-[11px] text-sand-400">
        <span>{creator ? `by ${short(creator)}` : 'wallet not connected'}</span>
        <span>lands in row {rowLabel(n)}</span>
      </div>
    </div>
  );
}

const rowLabel = (n: number) => slotOf(n).row + 1;

function Block({ n, title, sub, children }: { n: string; title: string; sub: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-display text-sm font-semibold text-gold">{n}</span>
        <div>
          <h3 className="text-[17px] font-semibold text-sand-50">{title}</h3>
          <p className="text-[13px] text-sand-400">{sub}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, count, error, children, className = '' }: { label: string; count?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`} data-invalid={!!error}>
      {label && (
        <span className="label">
          <span>{label}</span>
          {count && <span className="num normal-case tracking-normal text-sand-400/70">{count}</span>}
        </span>
      )}
      {children}
      {error && <span className="mt-1.5 block text-xs text-bad">{error}</span>}
    </label>
  );
}

function LinkField({ icon, label, value, onChange, placeholder, error }: { icon: 'globe' | 'xlogo' | 'telegram'; label: string; value: string; onChange: (v: string) => void; placeholder: string; error?: string }) {
  return (
    <Field label={label} error={error}>
      <div className="relative">
        <Icon name={icon} size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sand-400" />
        <input className="field pl-9 text-sm" data-invalid={!!error} value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder={placeholder} inputMode="url" autoComplete="off" spellCheck={false} />
      </div>
    </Field>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`num rounded-lg border px-2.5 py-1 text-xs transition ${active ? 'border-gold/60 bg-gold/10 text-gold' : 'border-sand-50/10 text-sand-400 hover:border-sand-50/25 hover:text-sand-100'}`}
    >
      {children}
    </button>
  );
}

function Drop({ url, onFile, onClear, error }: { url?: string; onFile: (f?: File) => void; onClear: () => void; error: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className="shrink-0">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload image"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onFile(e.dataTransfer.files[0]);
        }}
        className={`group relative grid h-28 w-28 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed transition sm:h-32 sm:w-32 ${
          over ? 'border-gold bg-gold/5' : error ? 'border-bad/60 bg-bad/5' : 'border-sand-50/20 bg-night-950/50 hover:border-gold/50'
        }`}
      >
        {url ? (
          <>
            <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <button
              type="button"
              className="absolute right-1.5 top-1.5 rounded-lg bg-night-950/80 p-1.5 text-sand-200 hover:text-bad"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              aria-label="Remove image"
            >
              <Icon name="x" size={13} />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-sand-400 transition group-hover:text-gold">
            <Icon name="upload" size={20} />
            <span className="text-xs">upload</span>
          </div>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function CostSummary({ cost }: { cost: ReturnType<typeof estimateCost> }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-sand-50/[0.08] bg-night-900/60">
      <div className="flex items-center justify-between border-b border-sand-50/[0.07] px-4 py-3">
        <span className="eyebrow">cost before signing</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sand-400/70">* estimate</span>
      </div>
      <dl className="divide-y divide-sand-50/[0.05] px-4 text-sm">
        {cost.lines.map((l) => (
          <div key={l.label} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="min-w-0">
              <div className="text-sand-200">
                {l.label}
                {l.estimate && <span className="text-sand-400">*</span>}
              </div>
              {l.hint && <div className="truncate text-[11.5px] text-sand-400/80">{l.hint}</div>}
            </dt>
            <dd className="num shrink-0 text-sand-100">{formatSol(l.sol)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between py-2.5">
          <dt className="text-sand-200">Platform fee</dt>
          <dd className="num text-gold">0</dd>
        </div>
      </dl>
      <div className="flex items-baseline justify-between border-t border-sand-50/[0.07] bg-night-950/50 px-4 py-3.5">
        <span className="text-sm font-medium text-sand-100">Total ≈</span>
        <span className="num text-xl text-sand-50">
          {formatSol(cost.total, 5)} <span className="text-xs text-sand-400">SOL</span>
        </span>
      </div>
    </div>
  );
}

/** building → sign in wallet → sending → confirmed */
const STAGES: { id: string; steps: StepId[]; label: (dry: boolean) => string }[] = [
  { id: 'building', steps: ['upload', 'build'], label: () => 'building' },
  { id: 'sign', steps: ['sign'], label: () => 'sign in wallet' },
  { id: 'sending', steps: ['send'], label: (d) => (d ? 'simulating' : 'sending') },
  { id: 'confirmed', steps: ['confirm'], label: (d) => (d ? 'placed' : 'confirmed') },
];

function Progress({ state, dryRun, onRetry, onBack }: { state: LaunchState; dryRun: boolean; onRetry: () => void; onBack: () => void }) {
  const cur = STAGES.findIndex((s) => state.step && s.steps.includes(state.step));
  const done = state.status === 'done';
  const failed = state.status === 'error';
  const lastLog = state.log[state.log.length - 1];
  return (
    <div className="mx-auto max-w-[1200px]" aria-live="polite">
      <ol className="grid grid-cols-4 gap-2">
        {STAGES.map((s, i) => {
          const isDone = done || i < cur || (i === cur && s.id === 'confirmed' && done);
          const active = i === cur && state.status === 'running';
          const bad = i === cur && failed;
          return (
            <li key={s.id} className="min-w-0">
              <div className={`h-1 rounded-full transition-colors duration-500 ${isDone ? 'bg-gold' : active ? 'animate-shimmer bg-[linear-gradient(90deg,#ffb52e33,#ffb52e,#ffb52e33)] bg-[length:200%_100%]' : bad ? 'bg-bad' : 'bg-sand-50/10'}`} />
              <div className={`mt-2 flex items-center gap-1.5 truncate font-mono text-[10.5px] uppercase tracking-[0.12em] sm:text-[11px] ${isDone ? 'text-gold' : active ? 'text-sand-50' : bad ? 'text-bad' : 'text-sand-400/70'}`}>
                {active && <Spinner size={11} />}
                {isDone && <Icon name="check" size={11} />}
                {s.label(dryRun)}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex min-h-[40px] items-center gap-3">
        {failed ? (
          <>
            <p className="min-w-0 flex-1 text-sm text-bad">{state.error}</p>
            <button className="btn-ghost shrink-0" onClick={onBack}>
              Edit
            </button>
            <button className="btn-gold shrink-0" onClick={onRetry}>
              <Icon name="refresh" /> Retry
            </button>
          </>
        ) : done ? (
          <p className="text-sm text-gold-hot">Brick #{state.result?.launch.brickNo ?? '…'} is falling into place.</p>
        ) : (
          <p className="min-w-0 truncate font-mono text-[12px] text-sand-400">
            {state.step === 'sign' ? (state.mode === 'mock' ? 'Approve the dry-run message in your wallet — no funds move.' : 'Approve the transaction in your wallet.') : lastLog}
          </p>
        )}
      </div>
    </div>
  );
}
