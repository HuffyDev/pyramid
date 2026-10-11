import { useMemo, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { Drawer, Modal } from '../components/Overlay';
import { PageHeader } from '../components/Shell';
import { useToast } from '../components/Toast';
import { useUI } from '../components/UIState';
import { Avatar, Empty, Field, KV, MonoId, Notice, OfferBadge, SampleTag, Segmented, ServerIcon, Stat, cx } from '../components/ui';
import {
  acceptOffer,
  advanceClock,
  cancelOffer,
  connectWallet,
  createOffer,
  processOfferPayout,
  processOfferRefund,
  removeMessage,
  submitMessage,
} from '../lib/actions';
import { SERVERS, serverById, userById } from '../lib/fixtures';
import { DAY, HOUR, dateTime, duration, sol, solLabel, solToLamports } from '../lib/format';
import { OFFER_STATUS_LABEL, RETENTION_MS, escrowTotals, offerSplit, offerView } from '../lib/ledger';
import { useDemo } from '../lib/store';
import type { Offer, OfferStatus } from '../lib/types';

export default function OffersPage() {
  const s = useDemo();
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [server, setServer] = useState('all');
  const [status, setStatus] = useState<OfferStatus | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const me = userById(s.session.walletUserId);
  const esc = escrowTotals(s);

  const list = useMemo(
    () =>
      s.offers
        .filter((o) => (tab === 'all' ? true : o.sponsorId === me?.id))
        .filter((o) => server === 'all' || o.serverId === server)
        .filter((o) => status === 'all' || offerView(o, s.now).status === status)
        .sort((a, b) => b.createdAt - a.createdAt),
    [s.offers, s.now, tab, me?.id, server, status],
  );
  const open = s.offers.find((o) => o.id === openId) ?? null;

  return (
    <div className="shell">
      <PageHeader
        eyebrow={<span className="chip bg-fuchsia/15 text-[#F68BC4] ring-1 ring-inset ring-fuchsia/25"><Icon name="megaphone" size={11} /> Sponsored posts · demo escrow</span>}
        title="Sponsor a server announcement."
        sub="A sponsored announcement must remain posted for 72 hours before the simulated payment is released."
      />

      <DemoClock now={s.now} />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Held in demo escrow" value={<>{sol(esc.held, 2)}<span className="ml-1 text-[13px] text-ink-mute">SOL</span></>} icon="lock" accent="gold" sub="separate from launch fees" />
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
                {SERVERS.map((sv) => (
                  <option key={sv.id} value={sv.id}>
                    {sv.name}
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
          {tab === 'mine' && !me ? (
            <Empty icon="wallet" title="Connect a demo wallet" body="My offers shows sponsored posts funded by your demo wallet." action={<button type="button" className="btn-primary btn-sm" onClick={() => connectWallet()}>Use demo wallet</button>} />
          ) : list.length === 0 ? (
            <Empty
              icon="megaphone"
              title="No offers here"
              body={tab === 'mine' ? 'You have not sponsored a post yet. Use the form to create one.' : 'No offers match these filters.'}
              action={
                <button type="button" className="btn-secondary btn-sm" onClick={() => { setServer('all'); setStatus('all'); setTab('all'); }}>
                  Clear filters
                </button>
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-2.5">
              {list.map((o) => (
                <li key={o.id} className="min-w-0">
                  <OfferCard offer={o} now={s.now} onOpen={() => setOpenId(o.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <OfferForm />
      </div>

      <OfferDrawer key={openId ?? "none"} offer={open} onClose={() => setOpenId(null)} />
    </div>
  );
}

function DemoClock({ now }: { now: number }) {
  const toast = useToast();
  const steps: [string, number][] = [
    ['+1h', HOUR],
    ['+12h', 12 * HOUR],
    ['+1d', DAY],
    ['+3d', 3 * DAY],
  ];
  return (
    <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:px-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blurple/15 text-blurple-light">
          <Icon name="clock" size={17} />
        </span>
        <div>
          <div className="kpi">Demo clock</div>
          <div className="text-[15px] font-bold text-ink tabular-nums">{dateTime(now)}</div>
        </div>
      </div>
      <span className="flex-1" />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] text-ink-mute">Advance demo clock</span>
        {steps.map(([label, ms]) => (
          <button
            key={label}
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              advanceClock(ms);
              toast.info(`Demo clock ${label}`, 'Countdowns updated. No real time passed.');
            }}
          >
            <Icon name="fastForward" size={12} /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function OfferCard({ offer, now, onOpen }: { offer: Offer; now: number; onOpen: () => void }) {
  const v = offerView(offer, now);
  const sv = serverById(offer.serverId);
  const sponsor = userById(offer.sponsorId);
  let timing: string;
  if (v.status === 'awaiting') timing = `Post within ${offer.postWithinDays}d of acceptance`;
  else if (v.status === 'accepted') timing = v.pastDeadline ? 'Deadline passed — refundable' : `Deadline in ${duration(offer.deadline! - now)}`;
  else if (v.status === 'posted' || v.status === 'retention') timing = v.canPay ? 'Retention complete — ready to pay' : `${duration(v.retentionLeft!)} retention left`;
  else timing = offer.settlement ? `Settled ${dateTime(offer.settlement.at)}` : '';
  return (
    <button type="button" onClick={onOpen} className="card group w-full p-4 text-left transition-colors hover:border-blurple/50 hover:bg-[#2E3035]">
      <div className="flex items-start gap-3">
        <ServerIcon server={sv} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold text-ink">{sv?.name}</span>
            <span className="text-[13px] text-ink-mute">#{offer.channel}</span>
            <OfferBadge status={v.status} />
          </div>
          <div className="mt-1 truncate text-[13px] text-ink-soft">
            Must include <span className="rounded bg-rail px-1.5 py-0.5 font-mono text-[12px] text-ink-body">{offer.required}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-mute">
            <span className="inline-flex items-center gap-1.5">
              <Avatar user={sponsor} size={16} /> @{sponsor?.username}
            </span>
            <span className="inline-flex items-center gap-1">
              <Icon name="clock" size={12} /> {timing}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[16px] font-bold text-ink">{sol(offer.price)} SOL</div>
          <div className="mt-1">
            <SampleTag sample={offer.sample} />
          </div>
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
  const s = useDemo();
  const toast = useToast();
  const ui = useUI();
  const me = userById(s.session.walletUserId);
  const [serverId, setServerId] = useState('srv-pixel');
  const [channel, setChannel] = useState('announcements');
  const [price, setPrice] = useState('1');
  const [days, setDays] = useState(3);
  const [required, setRequired] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const sv = serverById(serverId)!;
  const lam = solToLamports(price);

  const errors: Record<string, string> = {};
  if (lam === null || lam <= 0) errors.price = 'Enter a price above 0 SOL.';
  else if (lam > 100 * 1e9) errors.price = 'Demo maximum is 100 SOL.';
  if (!required.trim()) errors.required = 'Add the phrase or link the post must contain.';
  else if (required.trim().length < 3) errors.required = 'Use at least 3 characters.';
  else if (required.length > 80) errors.required = 'Maximum 80 characters.';
  if (notes.length > 200) errors.notes = 'Maximum 200 characters.';

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!me) {
      connectWallet();
      toast.success('Demo wallet connected', 'Your offer details were kept.');
      return;
    }
    setSubmitted(true);
    if (Object.keys(errors).length) {
      toast.error('Check the offer form', Object.values(errors)[0]);
      return;
    }
    setReview(true);
  }

  const split = offerSplit(lam ?? 0);

  return (
    <section className="card overflow-hidden lg:sticky lg:top-24">
      <div className="border-b border-black/20 bg-deep/60 px-5 py-3.5">
        <h2 className="text-[15px] font-bold text-ink">New sponsored post</h2>
        <p className="text-[12px] text-ink-mute">Funds are held in a simulated escrow</p>
      </div>
      <form className="grid gap-3.5 p-5" onSubmit={onSubmit} noValidate>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Server" htmlFor="o-server">
            <select
              id="o-server"
              className="input !py-2"
              value={serverId}
              onChange={(e) => {
                setServerId(e.target.value);
                setChannel(serverById(e.target.value)!.announcementChannel);
              }}
            >
              {SERVERS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Channel" htmlFor="o-channel">
            <select id="o-channel" className="input !py-2" value={channel} onChange={(e) => setChannel(e.target.value)}>
              {sv.channels.map((c) => (
                <option key={c} value={c}>
                  #{c}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Price" htmlFor="o-price" error={submitted ? errors.price : undefined}>
          <div className="relative">
            <input id="o-price" inputMode="decimal" className={cx('input !pr-12', submitted && errors.price && 'input-error')} value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-mute">SOL</span>
          </div>
        </Field>
        <div>
          <span className="label">Post within</span>
          <Segmented label="Post within" value={String(days)} onChange={(v) => setDays(Number(v))} options={[1, 3, 7, 14].map((d) => ({ value: String(d), label: `${d} day${d > 1 ? 's' : ''}` }))} />
        </div>
        <Field label="Required phrase or link" htmlFor="o-req" error={submitted ? errors.required : undefined} hint="Matched case-insensitively in the demo message.">
          <input id="o-req" className={cx('input', submitted && errors.required && 'input-error')} value={required} maxLength={80} placeholder="e.g. pixel jam signups" onChange={(e) => setRequired(e.target.value)} />
        </Field>
        <Field label="Notes (optional)" htmlFor="o-notes" error={submitted ? errors.notes : undefined}>
          <textarea id="o-notes" className="input min-h-[64px] resize-y" value={notes} maxLength={200} placeholder="Anything the server admin should know" onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="inset grid gap-1 p-3 text-[12.5px]">
          <div className="flex justify-between"><span className="text-ink-mute">Server receives (90%)</span><span className="font-semibold text-mint-bright">{solLabel(split.recipient)}</span></div>
          <div className="flex justify-between"><span className="text-ink-mute">Platform fee (10%)</span><span className="font-semibold text-ink">{solLabel(split.platform)}</span></div>
        </div>
        <button type="submit" className="btn-primary h-10 w-full">
          {me ? 'Review offer' : <><Icon name="wallet" size={15} /> Connect demo wallet</>}
        </button>
        {!me && (
          <button type="button" className="-mt-1 text-[12px] text-ink-mute hover:text-ink" onClick={() => ui.open('connect')}>
            More connection options
          </button>
        )}
      </form>
      <Modal
        open={review}
        onClose={() => !busy && setReview(false)}
        locked={busy}
        title="Review sponsored post"
        description="Simulated escrow — nothing is charged."
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setReview(false)} disabled={busy}>
              Back
            </button>
            <button
              type="button"
              className="btn-primary"
              data-autofocus
              disabled={busy}
              onClick={() => {
                setBusy(true);
                window.setTimeout(() => {
                  const r = createOffer({ serverId, channel, price: lam!, postWithinDays: days, required, notes });
                  setBusy(false);
                  if (!r.ok) {
                    toast.error('Offer not created', r.error);
                    return;
                  }
                  setReview(false);
                  setRequired('');
                  setNotes('');
                  setSubmitted(false);
                  toast.success('Offer created (demo)', `${sol(lam!)} SOL held in demo escrow.`);
                }, 600);
              }}
            >
              {busy ? 'Simulating…' : 'Simulate offer'}
            </button>
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-lg bg-card p-3">
          <ServerIcon server={sv} size={40} />
          <div>
            <div className="font-bold text-ink">{sv.name}</div>
            <div className="text-[13px] text-ink-mute">#{channel}</div>
          </div>
        </div>
        <div className="inset mt-3 divide-y divide-line/40 px-3">
          <KV k="Price (escrowed)" v={solLabel(lam ?? 0)} />
          <KV k="Deadline" v={`Post within ${days} day${days > 1 ? 's' : ''} of acceptance`} />
          <KV k="Retention requirement" v="72 hours continuously posted" />
          <KV k="Required text" v={<span className="font-mono text-[12px]">{required}</span>} />
          <KV k="Platform fee (10%)" v={solLabel(split.platform)} />
          <KV k="Recipient payout (90%)" v={<span className="text-mint-bright">{solLabel(split.recipient)}</span>} />
        </div>
        <div className="mt-3">
          <Notice>If no qualifying post exists by the deadline, the full price is refunded. Removing the post early invalidates it. Demo admins act manually — no real Discord messages are monitored.</Notice>
        </div>
      </Modal>
    </section>
  );
}

/* --------------------------------- Drawer --------------------------------- */

function OfferDrawer({ offer, onClose }: { offer: Offer | null; onClose: () => void }) {
  const s = useDemo();
  const toast = useToast();
  const [text, setText] = useState('');
  if (!offer) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;
  const v = offerView(offer, s.now);
  const sv = serverById(offer.serverId);
  const sponsor = userById(offer.sponsorId);
  const split = offerSplit(offer.price);
  const draft = text || `Sponsored: ${offer.required} — check it out!`;

  const run = (label: string, fn: () => { ok: boolean; error?: string }) => {
    const r = fn();
    if (r.ok) toast.success(label);
    else toast.error('Not allowed', r.error);
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${sv?.name} · #${offer.channel}`}
      subtitle={
        <span className="flex items-center gap-2">
          <OfferBadge status={v.status} /> <SampleTag sample={offer.sample} />
        </span>
      }
    >
      <div className="grid gap-4">
        <div className="inset divide-y divide-line/40 px-3">
          <KV k="Offer ID" v={<MonoId value={offer.id} />} />
          <KV k="Sponsor" v={<span className="inline-flex items-center gap-1.5"><Avatar user={sponsor} size={16} />@{sponsor?.username}</span>} />
          <KV k="Price (escrow)" v={solLabel(offer.price)} />
          <KV k="Split on completion" v={`${sol(split.recipient)} / ${sol(split.platform)} SOL`} />
          <KV k="Required text" v={<span className="font-mono text-[12px]">{offer.required}</span>} />
          <KV k="Post within" v={`${offer.postWithinDays} day(s)`} />
          <KV k="Deadline" v={offer.deadline ? <span className={v.pastDeadline ? 'text-[#FF8A8D]' : ''}>{dateTime(offer.deadline)} {offer.settlement ? '' : v.pastDeadline ? '(passed)' : `(${duration(offer.deadline - s.now)} left)`}</span> : 'Set on acceptance'} />
          {offer.notes && <KV k="Notes" v={offer.notes} />}
        </div>

        {v.live && !offer.settlement && (
          <div className="rounded-lg border border-fuchsia/30 bg-fuchsia/[0.07] p-3">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="font-semibold text-ink">72-hour retention</span>
              <span className="text-ink-mute">{v.canPay ? 'Complete' : `${duration(v.retentionLeft!)} left`}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-rail">
              <div className="h-full rounded-full bg-fuchsia transition-[width] duration-500" style={{ width: `${v.retentionProgress * 100}%` }} />
            </div>
            <div className="mt-2 rounded bg-page p-2 text-[13px] text-ink-body">“{v.live.text}”</div>
            <div className="mt-1 text-[11.5px] text-ink-mute">Posted {dateTime(v.live.submittedAt)} · ends {dateTime(v.live.submittedAt + RETENTION_MS)}</div>
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
            <div className="mt-1.5">
              <MonoId value={offer.settlement.receipt} />
            </div>
          </Notice>
        )}

        {!offer.settlement && (
          <section className="rounded-lg border border-blurple/35 bg-card">
            <div className="flex items-center justify-between border-b border-black/20 px-3 py-2">
              <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                <Icon name="zap" size={13} className="text-blurple-light" /> Demo controls
              </span>
              <span className="text-[11px] text-ink-mute">Clock {dateTime(s.now)}</span>
            </div>
            <div className="grid gap-2 p-3">
              <Action disabled={!v.canAccept} reason="Already accepted." onClick={() => run('Offer accepted as demo admin', () => acceptOffer(offer.id))} icon="shield" label="Accept as demo admin" />
              <div className={cx('rounded-md border border-line/50 p-2', !v.canSubmit && 'opacity-60')}>
                <label htmlFor="msg-text" className="label">Demo message text</label>
                <textarea id="msg-text" className="input min-h-[56px] !text-[13px]" value={draft} onChange={(e) => setText(e.target.value)} disabled={!v.canSubmit} />
                <button
                  type="button"
                  className="btn-secondary btn-sm mt-2 w-full"
                  disabled={!v.canSubmit}
                  onClick={() => {
                    const r = submitMessage(offer.id, draft);
                    if (!r.ok) toast.error('Not allowed', r.error);
                    else if (!r.value.qualifies) toast.error('Message does not qualify', `Required text “${offer.required}” was not found (case-insensitive).`);
                    else toast.success(r.value.replaced ? 'Replacement submitted — retention restarted' : 'Qualifying message submitted', '72-hour retention started on the demo clock.');
                  }}
                >
                  <Icon name="message" size={13} /> {v.live ? 'Submit replacement message' : 'Submit demo message'}
                </button>
                {!v.canSubmit && <p className="mt-1.5 text-[11.5px] text-ink-mute">{!offer.acceptedAt ? 'Accept the offer first.' : 'Deadline passed — submissions closed.'}</p>}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {([['+1h', HOUR], ['+12h', 12 * HOUR], ['+24h', DAY], ['+72h', 3 * DAY]] as [string, number][]).map(([l, ms]) => (
                  <button key={l} type="button" className="btn-outline btn-sm !px-1" onClick={() => { advanceClock(ms); toast.info(`Demo clock ${l}`); }}>
                    {l}
                  </button>
                ))}
              </div>
              <p className="-mt-1 text-center text-[11px] text-ink-dim">Advance demo clock</p>
              <Action disabled={!v.canRemove} reason="No live qualifying message." onClick={() => run('Message removed — post invalidated', () => removeMessage(offer.id))} icon="trash" label="Remove demo message" tone="danger" />
              <Action
                disabled={!v.canPay}
                reason={v.live ? `Retention incomplete — ${duration(v.retentionLeft ?? 0)} left.` : 'Needs a qualifying post kept for 72 hours.'}
                onClick={() => run('Demo payout processed (90/10)', () => processOfferPayout(offer.id))}
                icon="wallet"
                label={`Process demo payout · ${sol(split.recipient)} SOL`}
                tone="success"
              />
              <Action
                disabled={!v.canRefund}
                reason={!offer.acceptedAt ? 'Unaccepted offers can be cancelled instead.' : v.live ? 'A qualifying post is live.' : 'Deadline has not passed yet.'}
                onClick={() => run('Demo refund processed', () => processOfferRefund(offer.id))}
                icon="undo"
                label={`Process demo refund · ${sol(offer.price)} SOL`}
              />
              {v.canCancel && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => run('Offer cancelled — escrow returned', () => cancelOffer(offer.id))}>
                  Cancel offer (sponsor)
                </button>
              )}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-soft">Messages</h3>
          {offer.messages.length === 0 ? (
            <p className="text-[12.5px] text-ink-mute">No demo messages submitted.</p>
          ) : (
            <ul className="grid gap-1.5">
              {[...offer.messages].reverse().map((m) => (
                <li key={m.id} className="rounded-md bg-deep p-2 text-[12.5px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-mute">{dateTime(m.submittedAt)}</span>
                    {!m.qualifies ? <span className="chip bg-danger/12 text-[#FF8A8D]">Rejected</span> : m.removedAt !== undefined ? <span className="chip bg-white/[0.06] text-ink-mute">Removed {dateTime(m.removedAt)}</span> : <span className="chip bg-mint/15 text-mint-bright">Live</span>}
                  </div>
                  <div className="mt-1 text-ink-body">“{m.text}”</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-soft">Timeline</h3>
          <ol className="relative grid gap-3 border-l border-line pl-4">
            {[...offer.log].reverse().map((e, i) => (
              <li key={i} className="relative text-[12.5px]">
                <span className={cx('absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-page', i === 0 ? 'bg-blurple' : 'bg-chip')} />
                <div className="text-ink-body">{e.text}</div>
                <div className="text-[11px] text-ink-dim">{dateTime(e.at)}</div>
              </li>
            ))}
          </ol>
        </section>
        <p className="text-[11.5px] text-ink-dim">DiscordMoney does not monitor real Discord messages. Message submission and removal are manual demo steps.</p>
      </div>
    </Drawer>
  );
}

function Action({ disabled, reason, onClick, icon, label, tone }: { disabled: boolean; reason: string; onClick: () => void; icon: Parameters<typeof Icon>[0]['name']; label: string; tone?: 'success' | 'danger' }) {
  return (
    <div>
      <button type="button" disabled={disabled} onClick={onClick} className={cx('btn-sm w-full justify-start', tone === 'success' ? 'btn-success' : tone === 'danger' ? 'btn-outline !text-[#FF8A8D]' : 'btn-secondary')}>
        <Icon name={icon} size={13} /> {label}
      </button>
      {disabled && <p className="mt-1 text-[11px] text-ink-dim">{reason}</p>}
    </div>
  );
}
