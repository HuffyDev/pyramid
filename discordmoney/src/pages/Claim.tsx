import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ConfirmDialog } from '../components/Overlay';
import { PageHeader } from '../components/Shell';
import { useToast } from '../components/Toast';
import { useUI } from '../components/UIState';
import { Avatar, CopyButton, Empty, Field, KV, Notice, ServerIcon, Spinner, cx } from '../components/ui';
import { loginDiscord, requestClaimCode, updateTreasuryWallet, verifyClaim } from '../lib/actions';
import { discordConfigured } from '../lib/discord';
import { BOT_NAME, solscanAccount } from '../lib/fixtures';
import { dateTime, shortAddr, sol } from '../lib/format';
import { allTotals } from '../lib/ledger';
import { useApp } from '../lib/store';
import type { Guild } from '../lib/types';
import { isSolanaAddress } from '../lib/validate';

export default function ClaimPage() {
  const app = useApp();
  const toast = useToast();
  const loc = useLocation();
  const me = app.discord;
  const managed = useMemo(() => me?.guilds.filter((g) => g.canManage) ?? [], [me]);
  const initial = (loc.state as { serverId?: string } | null)?.serverId;
  const [serverId, setServerId] = useState<string>(initial ?? '');

  useEffect(() => {
    if (!serverId && managed.length) setServerId(managed.find((g) => !app.data.claims[g.id])?.id ?? managed[0].id);
  }, [managed, serverId, app.data.claims]);

  const guild = managed.find((g) => g.id === serverId);
  const claim = serverId ? app.data.claims[serverId] : undefined;

  const affected = useMemo(() => {
    const totals = allTotals(app.data);
    const ls = app.data.launches.filter((l) => l.recipient.kind === 'server' && l.recipient.serverId === serverId);
    return { launches: ls, pending: ls.reduce((a, l) => a + (totals.get(l.id)?.pending ?? 0), 0) };
  }, [app.data, serverId]);

  return (
    <div className="shell">
      <PageHeader
        eyebrow={<span className="chip bg-gold/12 text-gold ring-1 ring-inset ring-gold/25"><Icon name="shield" size={11} /> Server treasury</span>}
        title="Claim your server’s fees."
        sub="Verify you’re a server admin and link a Solana wallet to your server treasury."
      />

      {!me ? (
        <div className="card mx-auto flex max-w-xl flex-col items-center gap-4 p-8 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-blurple text-white">
            <Icon name="chat" size={26} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink">Log in with Discord</h2>
            <p className="mt-1 text-[14px] text-ink-mute">We read your username and the servers you’re in to find the ones you manage. Owners and members with Manage Server can claim.</p>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!discordConfigured}
            onClick={() => {
              const r = loginDiscord('/claim');
              if (!r.ok) toast.error('Discord login unavailable', r.error);
            }}
          >
            <Icon name="chat" size={15} /> {discordConfigured ? 'Log in with Discord' : 'Discord login coming soon'}
          </button>
        </div>
      ) : managed.length === 0 ? (
        <Empty icon="shield" title="No servers to claim" body={<>@{me.user.username} doesn’t own or have Manage Server in any server. Ask a server admin to claim it, or log in with a different account.</>} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_340px]">
          <div className="grid min-w-0 gap-4">
            <section className="card p-4">
              <div className="label">Your servers</div>
              <div className="grid max-h-[300px] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {managed.map((g) => {
                  const c = app.data.claims[g.id];
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={g.id === serverId}
                      onClick={() => setServerId(g.id)}
                      className={cx('flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors', g.id === serverId ? 'border-blurple bg-blurple/10' : 'border-line/50 bg-deep hover:border-ink-dim hover:bg-hover')}
                    >
                      <ServerIcon name={g.name} iconUrl={g.iconUrl} id={g.id} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">{g.name}</span>
                        <span className={cx('block text-[11.5px]', c ? 'text-mint-bright' : 'text-gold')}>{c ? 'Claimed' : 'Unclaimed'}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
            {guild && (claim ? <TreasurySettings guild={guild} /> : <ClaimForm key={guild.id} guild={guild} pending={affected.pending} launches={affected.launches.length} />)}
          </div>

          <aside className="grid content-start gap-4">
            <section className="card p-4">
              <h2 className="mb-3 text-[14px] font-bold text-ink">Admin identity</h2>
              <div className="flex items-center gap-3">
                <Avatar user={me.user} size={42} status />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink">{me.user.displayName}</div>
                  <div className="text-[12.5px] text-ink-mute">@{me.user.username}</div>
                </div>
              </div>
              {guild && (
                <div className="mt-3 flex items-center gap-2 rounded-md bg-mint/15 px-3 py-2 text-[12.5px] font-medium text-mint-bright">
                  <Icon name="check" size={14} /> Manage Server in {guild.name}
                </div>
              )}
            </section>
            {guild && (
              <section className="card p-4">
                <h2 className="mb-2 text-[14px] font-bold text-ink">Server information</h2>
                <div className="flex items-center gap-3">
                  <ServerIcon name={guild.name} iconUrl={guild.iconUrl} id={guild.id} size={40} />
                  <div className="min-w-0 truncate font-semibold text-ink">{guild.name}</div>
                </div>
                <div className="mt-2 divide-y divide-line/40">
                  <KV k="Server ID" v={<span className="inline-flex items-center gap-0.5"><span className="mono">{guild.id}</span><CopyButton value={guild.id} iconOnly label="Copy server ID" toast="Server ID copied" /></span>} />
                  <KV k="Treasury" v={claim ? <a className="link mono" href={solscanAccount(claim.wallet)} target="_blank" rel="noreferrer noopener">{shortAddr(claim.wallet, 5, 5)}</a> : <span className="text-gold">Unclaimed</span>} />
                  <KV k="Pending fees" v={`${sol(affected.pending, 4)} SOL`} />
                </div>
              </section>
            )}
            <section className="card p-4">
              <h2 className="mb-2 text-[14px] font-bold text-ink">Coins paying this server</h2>
              {affected.launches.length === 0 ? (
                <p className="text-[12.5px] text-ink-mute">No coins route fees to this server yet.</p>
              ) : (
                <ul className="grid gap-1">
                  {affected.launches.map((l) => (
                    <li key={l.id}>
                      <Link to={`/launches/${l.id}`} className="flex items-center justify-between rounded px-1.5 py-1 text-[13px] hover:bg-hover">
                        <span className="text-ink-body">
                          {l.name} <span className="mono text-ink-mute">${l.ticker}</span>
                        </span>
                        <Icon name="chevronRight" size={13} className="text-ink-dim" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function ClaimForm({ guild, pending, launches }: { guild: Guild; pending: number; launches: number }) {
  const app = useApp();
  const ui = useUI();
  const toast = useToast();
  const [wallet, setWallet] = useState(app.wallet?.address ?? '');
  const [code, setCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walletErr = wallet && !isSolanaAddress(wallet) ? 'That is not a valid Solana address.' : null;

  useEffect(() => {
    if (!wallet && app.wallet) setWallet(app.wallet.address);
  }, [app.wallet, wallet]);

  async function getCode() {
    setCodeBusy(true);
    setError(null);
    const r = await requestClaimCode(guild.id);
    setCodeBusy(false);
    if (r.ok) setCode(r.value.code);
    else setError(r.error);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!isSolanaAddress(wallet)) {
      setError('Enter a valid Solana treasury wallet.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await verifyClaim({ serverId: guild.id, wallet: wallet.trim(), code });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      toast.error('Verification failed', r.error);
      return;
    }
    toast.success(`${guild.name} claimed`, launches ? `${launches} coin(s) will now pay this treasury.` : 'Treasury payouts are enabled.');
  }

  return (
    <form onSubmit={verify} className="card overflow-hidden" noValidate>
      <div className="flex items-center gap-3 border-b border-black/20 bg-deep/60 px-5 py-3.5">
        <ServerIcon name={guild.name} iconUrl={guild.iconUrl} id={guild.id} size={36} />
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold text-ink">Claim {guild.name}</h2>
          <p className="text-[12px] text-ink-mute">{launches} coin(s) route fees here · {sol(pending, 3)} SOL pending</p>
        </div>
      </div>
      <div className="grid gap-4 p-5">
        <Field label="Treasury wallet (Solana)" htmlFor="c-wallet" error={walletErr} hint="Treasury payouts for this server are sent here.">
          <div className="flex gap-2">
            <input id="c-wallet" className={cx('input mono !text-[13px]', walletErr && 'input-error')} value={wallet} placeholder="Wallet address" spellCheck={false} onChange={(e) => setWallet(e.target.value.trim())} />
            {!app.wallet ? (
              <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => ui.open('connect')}>
                Connect
              </button>
            ) : (
              wallet !== app.wallet.address && (
                <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => setWallet(app.wallet!.address)}>
                  Use mine
                </button>
              )
            )}
          </div>
        </Field>

        <div className="rounded-lg border border-line/60 bg-deep p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[13.5px] font-semibold text-ink">Verify with {BOT_NAME}</div>
              <div className="text-[12px] text-ink-mute">Get a one-time code and run it in your server.</div>
            </div>
            <button type="button" className="btn-secondary btn-sm" onClick={() => void getCode()} disabled={codeBusy}>
              {codeBusy ? <Spinner size={13} /> : <Icon name="key" size={13} />} {code ? 'New code' : 'Get code'}
            </button>
          </div>
          {code && (
            <div className="mt-3 animate-fade-in">
              <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-blurple/50 bg-blurple/10 px-3 py-2.5">
                <span className="font-mono text-[18px] font-semibold tracking-wider text-blurple-pale">{code}</span>
                <CopyButton value={`/verify ${code}`} label="Copy command" toast="Command copied" />
              </div>
              <ol className="mt-3 grid list-decimal gap-1 pl-5 text-[12.5px] text-ink-soft">
                <li>Add {BOT_NAME} to {guild.name} if it isn’t there yet.</li>
                <li>
                  In any channel, run <span className="font-mono text-ink-body">/verify {code}</span>.
                </li>
                <li>Come back here and press “Verify & claim”.</li>
              </ol>
            </div>
          )}
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        <button type="submit" className="btn-primary h-10" disabled={busy || !code || !wallet}>
          {busy ? <><Spinner size={15} /> Verifying…</> : <><Icon name="shield" size={15} /> Verify & claim</>}
        </button>
        {(!code || !wallet) && <p className="-mt-2 text-center text-[11.5px] text-ink-dim">{!wallet ? 'Add a treasury wallet' : 'Get a verification code'} to continue.</p>}
      </div>
    </form>
  );
}

function TreasurySettings({ guild }: { guild: Guild }) {
  const app = useApp();
  const toast = useToast();
  const claim = app.data.claims[guild.id]!;
  const [next, setNext] = useState(claim.wallet);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setNext(claim.wallet), [claim.wallet]);
  const invalid = next !== claim.wallet && !isSolanaAddress(next);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-black/20 bg-mint/10 px-5 py-3.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-mint text-white">
          <Icon name="check" size={18} strokeWidth={3} />
        </span>
        <div>
          <h2 className="text-[15px] font-bold text-ink">{guild.name} treasury is claimed</h2>
          <p className="text-[12px] text-ink-mute">Treasury payouts are enabled for coins that route fees here.</p>
        </div>
      </div>
      <div className="grid gap-4 p-5">
        <div className="inset divide-y divide-line/40 px-3">
          <KV k="Verified admin" v={`@${claim.adminUsername}`} />
          <KV k="Claimed" v={dateTime(claim.claimedAt)} />
          <KV k="Treasury wallet" v={<a className="link mono" href={solscanAccount(claim.wallet)} target="_blank" rel="noreferrer noopener">{shortAddr(claim.wallet, 6, 6)}</a>} />
        </div>
        <div>
          <h3 className="mb-2 text-[13px] font-bold text-ink">Treasury settings</h3>
          <Field label="Treasury wallet" htmlFor="t-wallet" error={invalid ? 'That is not a valid Solana address.' : null} hint="Changes require confirmation.">
            <input id="t-wallet" className={cx('input mono !text-[13px]', invalid && 'input-error')} value={next} spellCheck={false} onChange={(e) => setNext(e.target.value.trim())} />
          </Field>
          <button type="button" className="btn-primary btn-sm mt-3" disabled={busy || invalid || next === claim.wallet} onClick={() => setConfirm(true)}>
            {busy ? <Spinner size={13} /> : <Icon name="edit" size={13} />} Update treasury wallet
          </button>
        </div>
        {claim.history.length > 0 && (
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
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Change treasury wallet?"
        confirmLabel="Confirm change"
        body={
          <div className="grid gap-2">
            <p>Future payouts for {guild.name} will go to the new wallet. Past payouts are unaffected.</p>
            <div className="inset px-3 py-2 text-[12.5px]">
              <div className="flex justify-between"><span className="text-ink-mute">From</span><span className="mono">{shortAddr(claim.wallet, 6, 6)}</span></div>
              <div className="flex justify-between"><span className="text-ink-mute">To</span><span className="mono text-mint-bright">{shortAddr(next, 6, 6)}</span></div>
            </div>
          </div>
        }
        onConfirm={async () => {
          setBusy(true);
          const r = await updateTreasuryWallet(guild.id, next);
          setBusy(false);
          if (r.ok) toast.success('Treasury wallet updated');
          else toast.error('Update failed', r.error);
        }}
      />
    </section>
  );
}
