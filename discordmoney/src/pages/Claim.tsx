import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ConfirmDialog } from '../components/Overlay';
import { PageHeader } from '../components/Shell';
import { useToast } from '../components/Toast';
import { useUI } from '../components/UIState';
import { Avatar, CopyButton, Field, KV, Notice, ServerIcon, Spinner, cx } from '../components/ui';
import { claimServer, connectDiscord, newClaimCode, updateTreasuryWallet } from '../lib/actions';
import { BOT_NAME, SERVERS, USERS, serverById, userById } from '../lib/fixtures';
import { dateTime, shortAddr, sol } from '../lib/format';
import { allTotals } from '../lib/ledger';
import { useDemo } from '../lib/store';

export default function ClaimPage() {
  const s = useDemo();
  const ui = useUI();
  const toast = useToast();
  const loc = useLocation();
  const initial = (loc.state as { serverId?: string } | null)?.serverId;
  const me = userById(s.session.discordUserId);
  const [serverId, setServerId] = useState(initial && serverById(initial) ? initial : 'srv-orbit');
  const [discordId, setDiscordId] = useState('');
  const [wallet, setWallet] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const server = serverById(serverId)!;
  const claim = s.claims[serverId];

  useEffect(() => {
    if (initial && serverById(initial)) setServerId(initial);
  }, [initial]);

  useEffect(() => {
    setError(null);
    setCode('');
    setDiscordId('');
  }, [serverId]);

  useEffect(() => {
    if (me && !wallet) setWallet(me.wallet);
  }, [me, wallet]);

  const hasPerm = me?.manages.includes(serverId) ?? false;
  const affected = useMemo(() => {
    const totals = allTotals(s);
    const ls = s.launches.filter((l) => l.recipient.kind === 'server' && l.recipient.serverId === serverId);
    return { count: ls.length, pending: ls.reduce((a, l) => a + (totals.get(l.id)?.pending ?? 0), 0), launches: ls };
  }, [s, serverId]);

  function verify(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!me) {
      setError('Connect a demo Discord identity first.');
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      const r = claimServer({ serverId, discordId, adminId: me.id, wallet, code });
      setBusy(false);
      if (!r.ok) {
        setError(r.error);
        toast.error('Verification failed', r.error);
        return;
      }
      toast.success(`${server.name} claimed (demo)`, `${affected.count} launch(es) can now receive simulated treasury payouts.`);
    }, 900);
  }

  return (
    <div className="shell">
      <PageHeader
        eyebrow={<span className="chip bg-gold/12 text-gold ring-1 ring-inset ring-gold/25"><Icon name="shield" size={11} /> Server treasury · demo verification</span>}
        title="Claim your server’s fees."
        sub="Verify a demo admin identity and assign a linked wallet to your server treasury."
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid min-w-0 gap-4">
          {/* Server picker */}
          <section className="card p-4">
            <div className="label">Fictional server</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SERVERS.map((sv) => {
                const c = s.claims[sv.id];
                return (
                  <button
                    key={sv.id}
                    type="button"
                    aria-pressed={sv.id === serverId}
                    onClick={() => setServerId(sv.id)}
                    className={cx(
                      'flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors',
                      sv.id === serverId ? 'border-blurple bg-blurple/10' : 'border-line/50 bg-deep hover:border-ink-dim hover:bg-hover',
                    )}
                  >
                    <ServerIcon server={sv} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">{sv.name}</span>
                      <span className={cx('block text-[11.5px]', c ? 'text-mint-bright' : 'text-gold')}>{c ? 'Claimed' : 'Unclaimed'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {claim ? (
            <TreasurySettings serverId={serverId} />
          ) : (
            <form onSubmit={verify} className="card overflow-hidden" noValidate>
              <div className="flex items-center gap-3 border-b border-black/20 bg-deep/60 px-5 py-3.5">
                <ServerIcon server={server} size={36} />
                <div>
                  <h2 className="text-[15px] font-bold text-ink">Claim {server.name}</h2>
                  <p className="text-[12px] text-ink-mute">{affected.count} launch(es) route fees here · {sol(affected.pending, 3)} SOL pending</p>
                </div>
              </div>
              <div className="grid gap-4 p-5">
                <Field label="Discord server ID" htmlFor="c-id" hint={<>Enter the fictional ID shown in server information. <button type="button" className="link" onClick={() => setDiscordId(server.discordId)}>Fill it in</button></>}>
                  <input id="c-id" className="input mono !text-[13px]" inputMode="numeric" placeholder="18-digit server ID" value={discordId} onChange={(e) => setDiscordId(e.target.value.replace(/\D/g, ''))} />
                </Field>
                <Field label="Demo treasury wallet" htmlFor="c-wallet" hint="Where simulated treasury payouts would go.">
                  <select id="c-wallet" className="input mono !text-[13px]" value={wallet} onChange={(e) => setWallet(e.target.value)}>
                    <option value="">Choose a demo wallet…</option>
                    {USERS.map((u) => (
                      <option key={u.id} value={u.wallet}>
                        {shortAddr(u.wallet, 6, 6)} — @{u.username}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="rounded-lg border border-line/60 bg-deep p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[13.5px] font-semibold text-ink">Simulated bot challenge</div>
                      <div className="text-[12px] text-ink-mute">Generate a one-time code for the demo bot.</div>
                    </div>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => { setCode(newClaimCode()); setError(null); }}>
                      <Icon name="key" size={13} /> {code ? 'Regenerate' : 'Generate demo code'}
                    </button>
                  </div>
                  {code && (
                    <div className="mt-3 animate-fade-in">
                      <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-blurple/50 bg-blurple/10 px-3 py-2.5">
                        <span className="font-mono text-[18px] font-semibold tracking-wider text-blurple-pale">{code}</span>
                        <CopyButton value={code} label="Copy code" toast="Demo code copied" />
                      </div>
                      <ol className="mt-3 grid list-decimal gap-1 pl-5 text-[12.5px] text-ink-soft">
                        <li>In a real flow, an admin would run <span className="font-mono text-ink-body">/verify {code}</span> with the {BOT_NAME} bot in {server.name}.</li>
                        <li>The bot would check the admin’s Manage Server permission through Discord’s API.</li>
                        <li>In this demo, “Simulate verification” checks the fixture permission below instead.</li>
                      </ol>
                    </div>
                  )}
                </div>

                {error && <Notice tone="error">{error}</Notice>}

                <Notice icon="info">
                  Production verification would require an authenticated Discord OAuth/bot check of permissions — changing a server description or posting a code alone is <b className="text-ink">not</b> sufficient proof of admin rights.
                </Notice>

                <button type="submit" className="btn-primary h-10" disabled={busy || !code || !wallet || !me}>
                  {busy ? <><Spinner size={15} /> Verifying (simulated)…</> : <><Icon name="shield" size={15} /> Simulate verification</>}
                </button>
                {(!code || !wallet || !me) && (
                  <p className="-mt-2 text-center text-[11.5px] text-ink-dim">
                    {!me ? 'Connect a demo Discord identity' : !code ? 'Generate a demo code' : 'Choose a treasury wallet'} to continue.
                  </p>
                )}
              </div>
            </form>
          )}
        </div>

        <aside className="grid content-start gap-4">
          <section className="card p-4">
            <h2 className="mb-3 text-[14px] font-bold text-ink">Admin identity</h2>
            {me ? (
              <>
                <div className="flex items-center gap-3">
                  <Avatar user={me} size={42} status />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink">{me.displayName}</div>
                    <div className="text-[12.5px] text-ink-mute">@{me.username}</div>
                  </div>
                </div>
                <div className={cx('mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px] font-medium', hasPerm ? 'bg-mint/15 text-mint-bright' : 'bg-danger/12 text-[#FF8A8D]')}>
                  <Icon name={hasPerm ? 'check' : 'x'} size={14} />
                  {hasPerm ? 'Manage Server (simulated)' : `No Manage Server in ${server.name}`}
                </div>
                <div className="mt-3 text-[12px] text-ink-mute">Try another fictional identity:</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {USERS.filter((u) => u.id !== me.id).slice(0, 8).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="chip bg-rail py-1 text-ink-soft hover:bg-active hover:text-ink"
                      onClick={() => {
                        connectDiscord(u.id);
                        toast.info(`Acting as @${u.username}`, u.manages.includes(serverId) ? 'Has simulated Manage Server here.' : 'No permission in this server.');
                      }}
                      title={u.manages.length ? `Admin of ${u.manages.map((id) => serverById(id)?.name).join(', ')}` : 'Not an admin anywhere'}
                    >
                      <Avatar user={u} size={14} /> {u.username}
                      {u.manages.includes(serverId) && <Icon name="shield" size={10} className="text-mint-bright" />}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center">
                <p className="text-[13px] text-ink-mute">Connect a demo Discord identity to verify admin rights.</p>
                <div className="mt-3 grid gap-2">
                  <button type="button" className="btn-primary btn-sm" onClick={() => { connectDiscord(); toast.success('Demo Discord connected'); }}>
                    Connect demo Discord
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => ui.open('connect')}>
                    Connection options
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-2 text-[14px] font-bold text-ink">Server information</h2>
            <div className="flex items-center gap-3">
              <ServerIcon server={server} size={40} />
              <div className="min-w-0">
                <div className="truncate font-semibold text-ink">{server.name}</div>
                <div className="text-[12px] text-ink-mute">{server.members.toLocaleString('en-US')} fictional members</div>
              </div>
            </div>
            <div className="mt-2 divide-y divide-line/40">
              <KV k="Server ID" v={<span className="inline-flex items-center gap-0.5"><span className="mono">{server.discordId}</span><CopyButton value={server.discordId} iconOnly label="Copy server ID" toast="Server ID copied" /></span>} />
              <KV k="Announcements" v={`#${server.announcementChannel}`} />
              <KV k="Demo admin(s)" v={USERS.filter((u) => u.manages.includes(server.id)).map((u) => `@${u.username}`).join(', ') || '—'} />
              <KV k="Treasury destination" v={claim ? <span className="mono">{shortAddr(claim.wallet, 5, 5)}</span> : wallet ? <span className="mono text-ink-mute">{shortAddr(wallet, 5, 5)} (pending)</span> : '—'} />
            </div>
          </section>

          <section className="card p-4">
            <h2 className="mb-2 text-[14px] font-bold text-ink">Associated launches</h2>
            {affected.launches.length === 0 ? (
              <p className="text-[12.5px] text-ink-mute">No launches route fees to this server yet.</p>
            ) : (
              <ul className="grid gap-1">
                {affected.launches.map((l) => (
                  <li key={l.id}>
                    <Link to={`/launches/${l.id}`} className="flex items-center justify-between rounded px-1.5 py-1 text-[13px] hover:bg-hover">
                      <span className="text-ink-body">{l.name} <span className="mono text-ink-mute">${l.ticker}</span></span>
                      <Icon name="chevronRight" size={13} className="text-ink-dim" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function TreasurySettings({ serverId }: { serverId: string }) {
  const s = useDemo();
  const toast = useToast();
  const claim = s.claims[serverId]!;
  const server = serverById(serverId)!;
  const me = userById(s.session.discordUserId);
  const [next, setNext] = useState(claim.wallet);
  const [confirm, setConfirm] = useState(false);
  const canEdit = Boolean(me?.manages.includes(serverId));
  useEffect(() => setNext(claim.wallet), [claim.wallet]);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-black/20 bg-mint/10 px-5 py-3.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-mint text-white">
          <Icon name="check" size={18} strokeWidth={3} />
        </span>
        <div>
          <h2 className="text-[15px] font-bold text-ink">{server.name} treasury is claimed</h2>
          <p className="text-[12px] text-ink-mute">Simulated treasury payouts are enabled for associated launches.</p>
        </div>
      </div>
      <div className="grid gap-4 p-5">
        <div className="inset divide-y divide-line/40 px-3">
          <KV k="Verified demo admin" v={<span className="inline-flex items-center gap-1.5"><Avatar user={userById(claim.adminId)} size={16} />@{userById(claim.adminId)?.username}</span>} />
          <KV k="Claimed" v={dateTime(claim.claimedAt)} />
          <KV k="Verification code" v={<span className="mono">{claim.code}</span>} />
          <KV k="Treasury wallet" v={<span className="mono">{shortAddr(claim.wallet, 6, 6)}</span>} />
          <KV k="Record" v={claim.sample ? 'Sample data' : 'Created in your demo'} />
        </div>
        <Notice tone="warn" icon="lock">Conflicting claims are blocked — a second admin cannot re-claim {server.name} while this claim exists.</Notice>

        <div>
          <h3 className="mb-2 text-[13px] font-bold text-ink">Treasury settings</h3>
          <Field label="Demo treasury wallet" htmlFor="t-wallet" hint={canEdit ? 'Changes require confirmation.' : `Only a demo admin of ${server.name} can change this. Switch identity to an admin.`}>
            <select id="t-wallet" className="input mono !text-[13px]" value={next} onChange={(e) => setNext(e.target.value)} disabled={!canEdit}>
              {USERS.map((u) => (
                <option key={u.id} value={u.wallet}>
                  {shortAddr(u.wallet, 6, 6)} — @{u.username}
                </option>
              ))}
            </select>
          </Field>
          <button type="button" className="btn-primary btn-sm mt-3" disabled={!canEdit || next === claim.wallet} onClick={() => setConfirm(true)}>
            <Icon name="edit" size={13} /> Update treasury wallet
          </button>
        </div>

        <div>
          <h3 className="mb-2 text-[13px] font-bold text-ink">Wallet history</h3>
          <ul className="grid gap-1 text-[12.5px]">
            {[...claim.history].reverse().map((h, i) => (
              <li key={i} className="flex justify-between rounded bg-deep px-3 py-1.5">
                <span className="mono text-ink-body">{shortAddr(h.wallet, 6, 6)}</span>
                <span className="text-ink-mute">{dateTime(h.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Change treasury wallet?"
        confirmLabel="Confirm change"
        body={
          <div className="grid gap-2">
            <p>Future simulated payouts for {server.name} will go to the new demo wallet. Past receipts keep their original destination.</p>
            <div className="inset px-3 py-2 text-[12.5px]">
              <div className="flex justify-between"><span className="text-ink-mute">From</span><span className="mono">{shortAddr(claim.wallet, 6, 6)}</span></div>
              <div className="flex justify-between"><span className="text-ink-mute">To</span><span className="mono text-mint-bright">{shortAddr(next, 6, 6)}</span></div>
            </div>
          </div>
        }
        onConfirm={() => {
          const r = updateTreasuryWallet(serverId, next, me?.id ?? null);
          if (r.ok) toast.success('Treasury wallet updated (demo)');
          else toast.error('Update refused', r.error);
        }}
      />
    </section>
  );
}
