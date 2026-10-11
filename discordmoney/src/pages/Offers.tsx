import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Drawer, Modal } from '../components/Overlay';
import { PageHeader } from '../components/Shell';
import { useToast } from '../components/Toast';
import { useUI } from '../components/UIState';
import { Empty, Field, KV, MonoId, Notice, OfferBadge, Segmented, ServerIcon, Spinner, Stat, cx } from '../components/ui';
import { acceptOffer, cancelOffer, createOffer, refresh } from '../lib/actions';
import { solscanTx } from '../lib/fixtures';
import { dateTime, duration, shortAddr, sol, solLabel, solToLamports } from '../lib/format';
import { OFFER_STATUS_LABEL, RETENTION_MS, escrowTotals, offerSplit, offerView } from '../lib/ledger';
import { useApp, useNow } from '../lib/store';
import type { Offer, OfferStatus } from '../lib/types';
import { DISCORD_ID_RE } from '../lib/validate';

export default function OffersPage() {
  const app = useApp();
  const s = app.data;
  const now = useNow();
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [server, setServer] = useState('all');
  const [status, setStatus] = useState<OfferStatus | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const me = app.wallet?.address;
  const esc = escrowTotals(s);
  const servers = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of s.offers) m.set(o.serverId, o.serverName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [s.offers]);

  const list = useMemo(
    () =>
      s.offers
        .filter((o) => (tab === 'all' ? true : o.sponsorWallet === me))
        .filter((o) => server === 'all' || o.serverId === server)
        .filter((o) => status === 'all' || offerView(o, now).status === status)
        .sort((a, b) => b.createdAt - a.createdAt),
    [s.offers, now, tab, me, server, status],
  );
  const open = s.offers.find((o) => o.id === openId) ?? null;

  return (
    <div className="shell">
      <PageHeader
        eyebrow={<span className="chip bg-fuchsia/15 text-[#F68BC4] ring-1 ring-inset ring-fuchsia/25"><Icon name="megaphone" size={11} /> Sponsored posts · escrow</span>}
        title="Sponsor a server announcement."
        sub="A sponsored announcement must remain posted for 72 hours before payment is released from escrow."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Held in escrow" value={<>{sol(esc.held, 2)}<span className="ml-1 text-[13px] text-ink-mute">SOL</span></>} icon="lock" accent="gold" sub="separate from launch fees" />
        <Stat label="Released to servers" value={<>{sol(esc.released, 2)}<span className="ml-1 text-[13px] text-ink-mute">SOL</span></>} icon="check" accent="mint" sub="90% recipient share" />
        <Stat label="Refunded to sponsors" value={<>{sol(esc.refunded, 2)}<span className="ml-1 text-[13px] text-ink-mute">SOL</span></>} icon="undo" sub="refunds + cancellations" />
        <Stat label="Platform fee (posts)" value={<>{sol(esc.platform, 3)}<span className="ml-1 text-[13px] text-ink-mute">SOL</span></>} icon="coins" accent="fuchsia" sub="10% on completed posts" />
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Segmented label="Offer scope" value={tab} onChange={setTab} options={[{ value: 'all', label: 'All offers' }, { value: 'mine', label: 'My offers' }]} />
            <span className="flex-1" />
            <div className="grid grid-cols-2 gap-2">
              <select className="input !py-1.5 !text-[13px]" value={server} onChange={(e) => setServer(e.target.value)} aria-label="Filter by server">
                <option value="all">All servers</option>
                {servers.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <select className="input !py-1.5 !text-[13px]" value={status} onChange={(e) => setStatus(e.target.value as OfferStatus | 'all')} aria-label="Filter by status">
                <option value="all">All statuses</option>
                {(Object.keys(OFFER_STATUS_LABEL) as OfferStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {OFFER_STATUS_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-2 text-[12.5px] text-ink-mute" aria-live="polite">
            {list.length} offer{list.length === 1 ? '' : 's'}
          </div>
          {app.status === 'loading' ? (
            <div className="grid gap-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-[110px] rounded-xl" />
              ))}
            </div>
          ) : app.status === 'error' ? (
            <Empty icon="alert" title="Couldn’t load offers" body={app.error ?? 'Please try again.'} action={<button type="button" className="btn-primary btn-sm" onClick={() => void refresh()}>Retry</button>} />
          ) : tab === 'mine' && !me ? (
            <MineEmpty />
          ) : list.length === 0 ? (
            <Empty
              icon="megaphone"
              title={s.offers.length === 0 ? 'No sponsored posts yet' : 'No offers match'}
              body={s.offers.length === 0 ? 'Create the first offer with the form.' : tab === 'mine' ? 'You haven’t sponsored a post yet.' : 'Try different filters.'}
              action={
                s.offers.length > 0 ? (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => { setServer('all'); setStatus('all'); setTab('all'); }}>
                    Clear filters
                  </button>
                ) : undefined
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-2.5">
              {list.map((o) => (
                <li key={o.id} className="min-w-0">
                  <OfferCard offer={o} now={now} onOpen={() => setOpenId(o.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <OfferForm />
      </div>

      <OfferDrawer key={openId ?? 'none'} offer={open} now={now} onClose={() => setOpenId(null)} />
    </div>
  );
}

function MineEmpty() {
  const ui = useUI();
  return <Empty icon="wallet" title="Connect your wallet" body="My offers shows sponsored posts funded by your wallet." action={<button type="button" className="btn-primary btn-sm" onClick={() => ui.open('connect')}>Connect</button>} />;
}

function OfferCard({ offer, now, onOpen }: { offer: Offer; now: number; onOpen: () => void }) {
  const v = offerView(offer, now);
  let timing: string;
  if (v.status === 'awaiting') timing = `Post within ${offer.postWithinDays}d of acceptance`;
  else if (v.status === 'accepted') timing = v.pastDeadline ? 'Deadline passed — refund pending' : `Deadline in ${duration(offer.deadline! - now)}`;
  else if (v.status === 'posted' || v.status === 'retention') timing = v.retentionLeft === 0 ? 'Retention complete — releasing payment' : `${duration(v.retentionLeft!)} retention left`;
  else timing = offer.settlement ? `Settled ${dateTime(offer.settlement.at)}` : '';
  return (
    <button type="button" onClick={onOpen} className="card group w-full p-4 text-left transition-colors hover:border-blurple/50 hover:bg-[#2E3035]">
      <div className="flex items-start gap-3">
        <ServerIcon name={offer.serverName} id={offer.serverId} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold text-ink">{offer.serverName}</span>
            <span className="text-[13px] text-ink-mute">#{offer.channel}</span>
            <OfferBadge status={v.status} />
          </div>
          <div className="mt-1 truncate text-[13px] text-ink-soft">
            Must include <span className="rounded bg-rail px-1.5 py-0.5 font-mono text-[12px] text-ink-body">{offer.required}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-mute">
            <span className="mono">Sponsor {shortAddr(offer.sponsorWallet)}</span>
            <span className="inline-flex items-center gap-1">
              <Icon name="clock" size={12} /> {timing}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[16px] font-bold text-ink">{sol(offer.price)} SOL</div>
        </div>
      </div>
      {(v.status === 'posted' || v.status === 'retention') && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-rail">
          <div className="h-full rounded-full bg-fuchsia transition-[width] duration-500" style={{ width: `${v.retentionProgress * 100}%` }} />
        </div>
      )}
    </button>
  );
}

/* ---------------------------------- Form ---------------------------------- */

function OfferForm() {
  const app = useApp();
  const toast = useToast();
  const ui = useUI();
  const claimed = Object.values(app.data.claims).sort((a, b) => a.serverName.localeCompare(b.serverName));
  const [serverId, setServerId] = useState('');
  const [serverName, setServerName] = useState('');
  const [channel, setChannel] = useState('announcements');
  const [price, setPrice] = useState('1');
  const [days, setDays] = useState(3);
  const [required, setRequired] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = app.wallet;
  const lam = solToLamports(price);

  const errors: Record<string, string> = {};
  if (!DISCORD_ID_RE.test(serverId)) errors.serverId = 'Choose a server or enter its 17–20 digit ID.';
  if (!serverName.trim()) errors.serverName = 'Enter the server name.';
  if (!/^[a-z0-9_-]{1,100}$/.test(channel)) errors.channel = 'Use the channel name without #.';
  if (lam === null || lam <= 0) errors.price = 'Enter a price above 0 SOL.';
  else if (lam > 1000 * 1e9) errors.price = 'Maximum is 1,000 SOL.';
  if (!required.trim()) errors.required = 'Add the phrase or link the post must contain.';
  else if (required.trim().length < 3) errors.required = 'Use at least 3 characters.';
  if (notes.length > 200) errors.notes = 'Maximum 200 characters.';
  const err = (k: string) => (submitted ? errors[k] : undefined);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!me) {
      ui.open('connect');
      return;
    }
    setSubmitted(true);
    if (Object.keys(errors).length) {
      toast.error('Check the offer form', Object.values(errors)[0]);
      return;
    }
    setError(null);
    setReview(true);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const r = await createOffer({ serverId, channel, price: lam!, postWithinDays: days, required: required.trim(), notes: notes.trim() });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setReview(false);
    setRequired('');
    setNotes('');
    setSubmitted(false);
    toast.success('Offer created', `${sol(lam!)} SOL held in escrow.`);
  }

  const split = offerSplit(lam ?? 0);
  const known = claimed.find((c) => c.serverId === serverId);

  return (
    <section className="card overflow-hidden lg:sticky lg:top-24">
      <div className="border-b border-black/20 bg-deep/60 px-5 py-3.5">
        <h2 className="text-[15px] font-bold text-ink">New sponsored post</h2>
        <p className="text-[12px] text-ink-mute">Your payment is held in escrow</p>
      </div>
      <form className="grid gap-3.5 p-5" onSubmit={onSubmit} noValidate>
        {claimed.length > 0 && (
          <Field label="Server" htmlFor="o-server">
            <select
              id="o-server"
              className="input !py-2"
              value={known ? serverId : ''}
              onChange={(e) => {
                const c = claimed.find((x) => x.serverId === e.target.value);
                setServerId(c?.serverId ?? '');
                setServerName(c?.serverName ?? '');
              }}
            >
              <option value="">Enter a server manually…</option>
              {claimed.map((c) => (
                <option key={c.serverId} value={c.serverId}>
                  {c.serverName}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Server ID" htmlFor="o-sid" error={err('serverId')}>
            <input id="o-sid" inputMode="numeric" className={cx('input mono !text-[13px]', err('serverId') && 'input-error')} value={serverId} placeholder="17–20 digits" onChange={(e) => setServerId(e.target.value.replace(/\D/g, '').slice(0, 20))} />
          </Field>
          <Field label="Server name" htmlFor="o-sname" error={err('serverName')}>
            <input id="o-sname" className={cx('input', err('serverName') && 'input-error')} value={serverName} placeholder="My Server" onChange={(e) => setServerName(e.target.value)} />
          </Field>
        </div>
        <Field label="Channel" htmlFor="o-channel" error={err('channel')}>
          <div className="relative">
            <Icon name="hash" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" />
            <input id="o-channel" className={cx('input !pl-8', err('channel') && 'input-error')} value={channel} onChange={(e) => setChannel(e.target.value.toLowerCase().replace(/^#/, '').replace(/\s+/g, '-'))} />
          </div>
        </Field>
        <Field label="Price" htmlFor="o-price" error={err('price')}>
          <div className="relative">
            <input id="o-price" inputMode="decimal" className={cx('input !pr-12', err('price') && 'input-error')} value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-mute">SOL</span>
          </div>
        </Field>
        <div>
          <span className="label">Post within</span>
          <Segmented label="Post within" value={String(days)} onChange={(v) => setDays(Number(v))} options={[1, 3, 7, 14].map((d) => ({ value: String(d), label: `${d} day${d > 1 ? 's' : ''}` }))} />
        </div>
        <Field label="Required phrase or link" htmlFor="o-req" error={err('required')} hint="The post must contain this text (not case-sensitive).">
          <input id="o-req" className={cx('input', err('required') && 'input-error')} value={required} maxLength={80} placeholder="e.g. join our launch" onChange={(e) => setRequired(e.target.value)} />
        </Field>
        <Field label="Notes (optional)" htmlFor="o-notes" error={err('notes')}>
          <textarea id="o-notes" className="input min-h-[64px] resize-y" value={notes} maxLength={200} placeholder="Anything the server admin should know" onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="inset grid gap-1 p-3 text-[12.5px]">
          <div className="flex justify-between"><span className="text-ink-mute">Server receives (90%)</span><span className="font-semibold text-mint-bright">{solLabel(split.recipient)}</span></div>
          <div className="flex justify-between"><span className="text-ink-mute">Platform fee (10%)</span><span className="font-semibold text-ink">{solLabel(split.platform)}</span></div>
        </div>
        <button type="submit" className="btn-primary h-10 w-full">
          {me ? 'Review offer' : <><Icon name="wallet" size={15} /> Connect wallet</>}
        </button>
      </form>
      <Modal
        open={review}
        onClose={() => !busy && setReview(false)}
        locked={busy}
        title="Review sponsored post"
        description="Your payment is held in escrow until the post completes."
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setReview(false)} disabled={busy}>
              Back
            </button>
            <button type="button" className="btn-primary" data-autofocus disabled={busy} onClick={() => void confirm()}>
              {busy ? <><Spinner size={14} /> Creating…</> : error ? 'Try again' : 'Create offer'}
            </button>
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-lg bg-card p-3">
          <ServerIcon name={serverName || 'Server'} id={serverId} size={40} />
          <div>
            <div className="font-bold text-ink">{serverName}</div>
            <div className="text-[13px] text-ink-mute">#{channel}</div>
          </div>
        </div>
        <div className="inset mt-3 divide-y divide-line/40 px-3">
          <KV k="Price (escrowed)" v={solLabel(lam ?? 0)} />
          <KV k="Deadline" v={`Post within ${days} day${days > 1 ? 's' : ''} of acceptance`} />
          <KV k="Retention requirement" v="72 hours continuously posted" />
          <KV k="Required text" v={<span className="font-mono text-[12px]">{required}</span>} />
          <KV k="Platform fee (10%)" v={solLabel(split.platform)} />
          <KV k="Server payout (90%)" v={<span className="text-mint-bright">{solLabel(split.recipient)}</span>} />
        </div>
        <div className="mt-3 grid gap-2">
          <Notice>If no qualifying post exists by the deadline, the full price is refunded. Removing the post before 72 hours invalidates it.</Notice>
          {error && <Notice tone="error"><b className="text-ink">Offer not created.</b> {error}</Notice>}
        </div>
      </Modal>
    </section>
  );
}

/* --------------------------------- Drawer --------------------------------- */

function OfferDrawer({ offer, now, onClose }: { offer: Offer | null; now: number; onClose: () => void }) {
  const app = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState<null | 'accept' | 'cancel'>(null);
  if (!offer) return null;
  const v = offerView(offer, now);
  const split = offerSplit(offer.price);
  const isAdmin = Boolean(app.discord?.guilds.find((g) => g.id === offer.serverId && g.canManage));
  const isSponsor = app.wallet?.address === offer.sponsorWallet;

  const run = async (kind: 'accept' | 'cancel') => {
    setBusy(kind);
    const r = kind === 'accept' ? await acceptOffer(offer.id) : await cancelOffer(offer.id);
    setBusy(null);
    if (r.ok) toast.success(kind === 'accept' ? 'Offer accepted' : 'Offer cancelled — escrow returned');
    else toast.error(kind === 'accept' ? 'Could not accept' : 'Could not cancel', r.error);
  };

  return (
    <Drawer open onClose={onClose} title={`${offer.serverName} · #${offer.channel}`} subtitle={<OfferBadge status={v.status} />}>
      <div className="grid gap-4">
        <div className="inset divide-y divide-line/40 px-3">
          <KV k="Offer ID" v={<MonoId value={offer.id} />} />
          <KV k="Sponsor" v={<span className="mono">{shortAddr(offer.sponsorWallet, 5, 5)}</span>} />
          <KV k="Price (escrow)" v={solLabel(offer.price)} />
          <KV k="Split on completion" v={`${sol(split.recipient)} / ${sol(split.platform)} SOL`} />
          <KV k="Required text" v={<span className="font-mono text-[12px]">{offer.required}</span>} />
          <KV k="Post within" v={`${offer.postWithinDays} day(s)`} />
          <KV k="Deadline" v={offer.deadline ? <span className={v.pastDeadline ? 'text-[#FF8A8D]' : ''}>{dateTime(offer.deadline)} {offer.settlement ? '' : v.pastDeadline ? '(passed)' : `(${duration(offer.deadline - now)} left)`}</span> : 'Set on acceptance'} />
          {offer.notes && <KV k="Notes" v={offer.notes} />}
        </div>

        {v.live && !offer.settlement && (
          <div className="rounded-lg border border-fuchsia/30 bg-fuchsia/[0.07] p-3">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="font-semibold text-ink">72-hour retention</span>
              <span className="text-ink-mute">{v.retentionLeft === 0 ? 'Complete' : `${duration(v.retentionLeft!)} left`}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-rail">
              <div className="h-full rounded-full bg-fuchsia transition-[width] duration-500" style={{ width: `${v.retentionProgress * 100}%` }} />
            </div>
            <div className="mt-2 rounded bg-page p-2 text-[13px] text-ink-body">“{v.live.text}”</div>
            <div className="mt-1 text-[11.5px] text-ink-mute">
              Posted {dateTime(v.live.submittedAt)} · ends {dateTime(v.live.submittedAt + RETENTION_MS)}
              {v.live.url && (
                <>
                  {' · '}
                  <a className="link" href={v.live.url} target="_blank" rel="noreferrer noopener">
                    Open message
                  </a>
                </>
              )}
            </div>
          </div>
        )}

        {offer.settlement && (
          <Notice tone={offer.settlement.kind === 'paid' ? 'success' : 'info'}>
            {offer.settlement.kind === 'paid' ? (
              <>Completed — {sol(offer.settlement.recipientAmount)} SOL released to {offer.settlement.to}, {sol(offer.settlement.platformAmount)} SOL platform fee.</>
            ) : offer.settlement.kind === 'refunded' ? (
              <>Refunded — {sol(offer.settlement.amount)} SOL returned to the sponsor. {offer.settlement.reason}</>
            ) : (
              <>Cancelled before acceptance — {sol(offer.settlement.amount)} SOL returned.</>
            )}
            {offer.settlement.signature && (
              <div className="mt-1.5">
                <a className="link" href={solscanTx(offer.settlement.signature)} target="_blank" rel="noreferrer noopener">
                  View transaction
                </a>
              </div>
            )}
          </Notice>
        )}

        {(v.canAccept || v.canCancel) && (
          <section className="grid gap-2 rounded-lg border border-blurple/35 bg-card p-3">
            {v.canAccept &&
              (isAdmin ? (
                <button type="button" className="btn-success btn-sm w-full" disabled={busy !== null} onClick={() => void run('accept')}>
                  {busy === 'accept' ? <Spinner size={13} /> : <Icon name="shield" size={13} />} Accept offer
                </button>
              ) : (
                <p className="text-[12px] text-ink-mute">
                  Admins of {offer.serverName} can accept this offer after logging in with Discord.{' '}
                  {!app.discord && <Link to="/claim" className="link">Log in</Link>}
                </p>
              ))}
            {v.canCancel && isSponsor && (
              <button type="button" className="btn-outline btn-sm w-full !text-[#FF8A8D]" disabled={busy !== null} onClick={() => void run('cancel')}>
                {busy === 'cancel' ? <Spinner size={13} /> : <Icon name="undo" size={13} />} Cancel offer & refund
              </button>
            )}
          </section>
        )}

        <section>
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-soft">Messages</h3>
          {offer.messages.length === 0 ? (
            <p className="text-[12.5px] text-ink-mute">No messages posted yet.</p>
          ) : (
            <ul className="grid gap-1.5">
              {[...offer.messages].reverse().map((m) => (
                <li key={m.id} className="rounded-md bg-deep p-2 text-[12.5px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-mute">{dateTime(m.submittedAt)}</span>
                    {!m.qualifies ? <span className="chip bg-danger/12 text-[#FF8A8D]">Doesn’t qualify</span> : m.removedAt !== undefined ? <span className="chip bg-white/[0.06] text-ink-mute">Removed {dateTime(m.removedAt)}</span> : <span className="chip bg-mint/15 text-mint-bright">Live</span>}
                  </div>
                  <div className="mt-1 text-ink-body">“{m.text}”</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-soft">Timeline</h3>
          {offer.log.length === 0 ? (
            <p className="text-[12.5px] text-ink-mute">No events yet.</p>
          ) : (
            <ol className="relative grid gap-3 border-l border-line pl-4">
              {[...offer.log].reverse().map((e, i) => (
                <li key={i} className="relative text-[12.5px]">
                  <span className={cx('absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-page', i === 0 ? 'bg-blurple' : 'bg-chip')} />
                  <div className="text-ink-body">{e.text}</div>
                  <div className="text-[11px] text-ink-dim">{dateTime(e.at)}</div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Drawer>
  );
}
