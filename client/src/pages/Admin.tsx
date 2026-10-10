import { useCallback, useEffect, useState } from 'react';
import { api, type AdminStatus } from '../lib/api';
import { Icon, Spinner } from '../components/Icon';

const KEY = 'pyramid:admin';

export default function Admin() {
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mint, setMint] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Awaited<ReturnType<typeof api.admin.bricks>>['bricks']>([]);

  const refresh = useCallback(async (t = token) => {
    if (!t) return;
    try {
      const s = await api.admin.status(t);
      setStatus(s);
      setMint(s.settings.PYRAMID_MINT ?? '');
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
      setStatus(null);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => api.admin.bricks(token, q).then((r) => setHits(r.bricks)).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q, status, token]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await fn();
      setMsg(done);
      await refresh();
      setHits((await api.admin.bricks(token, q)).bricks);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!status)
    return (
      <div className="mx-auto max-w-[420px] px-4 py-24">
        <div className="eyebrow">admin</div>
        <h1 className="display mt-2 text-3xl">the mason's door.</h1>
        <form
          className="mt-8 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              sessionStorage.setItem(KEY, draft);
            } catch {
              /* ignore */
            }
            setToken(draft);
            void refresh(draft);
          }}
        >
          <input className="field font-mono" type="password" placeholder="ADMIN_TOKEN" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="current-password" />
          <button className="btn-gold w-full" disabled={!draft}>
            <Icon name="lock" /> Enter
          </button>
          {err && token && <p className="text-sm text-bad">{err}</p>}
        </form>
      </div>
    );

  const s = status.settings;
  return (
    <div className="mx-auto max-w-[900px] px-4 pb-24 pt-10 sm:px-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="eyebrow">admin · {status.bricks} bricks</div>
          <h1 className="display mt-2 text-3xl">the mason's door.</h1>
        </div>
        <button
          className="btn-quiet text-sm"
          onClick={() => {
            try {
              sessionStorage.removeItem(KEY);
            } catch {
              /* ignore */
            }
            setToken('');
            setStatus(null);
          }}
        >
          Sign out
        </button>
      </div>

      {status.db.state !== 'ready' && (
        <div className={`mt-6 rounded-xl border px-4 py-3 text-sm ${status.db.state === 'none' ? 'border-gold/30 bg-gold/10 text-gold-hot' : 'border-bad/30 bg-bad/10 text-bad'}`}>
          <div className="font-mono text-[11px] uppercase tracking-widest">database · {status.db.state}{status.db.attempts > 1 ? ` · ${status.db.attempts} attempts` : ''}</div>
          <p className="mt-1">
            {status.db.state === 'none' ? 'DATABASE_URL is not set: bricks live in memory and are lost on restart.' : (status.db.hint ?? 'Connecting…')}
          </p>
          {status.db.error && <p className="mt-1 font-mono text-[11px] opacity-80">{status.db.error}</p>}
        </div>
      )}

      {(msg || err) && <p className={`mt-6 rounded-xl border px-4 py-2.5 text-sm ${err ? 'border-bad/30 bg-bad/10 text-bad' : 'border-ok/30 bg-ok/10 text-ok'}`}>{err ?? msg}</p>}

      <section className="panel mt-8 divide-y divide-sand-50/[0.06]">
        <Toggle
          title="DRY_RUN"
          sub={s.DRY_RUN ? 'Launches are built + simulated, never broadcast.' : 'LIVE: launches are broadcast to mainnet.'}
          on={s.DRY_RUN}
          disabled={busy || (s.DRY_RUN && !status.heliusConfigured)}
          note={s.DRY_RUN && !status.heliusConfigured ? 'Set HELIUS_RPC_URL to go live.' : undefined}
          onChange={(v) => {
            if (!v && !confirm('Turn DRY_RUN off? Launches will be broadcast to Solana mainnet.')) return;
            void act(() => api.admin.set(token, 'DRY_RUN', v), `DRY_RUN ${v ? 'on' : 'off'}`);
          }}
        />
        <Toggle
          title="SIM_MODE"
          sub="Synthetic launches every few seconds (memory only, never on-chain)."
          on={s.SIM_MODE}
          disabled={busy}
          onChange={(v) => void act(() => api.admin.set(token, 'SIM_MODE', v), `SIM_MODE ${v ? 'on' : 'off'}`)}
        />
        <div className="p-5">
          <div className="font-semibold text-sand-50">PYRAMID_MINT</div>
          <p className="text-sm text-sand-400">The $PYRAMID contract shown in the capstone. Empty = CA hidden (“sealed”).</p>
          <div className="mt-3 flex gap-2">
            <input className="field font-mono text-sm" value={mint} onChange={(e) => setMint(e.target.value.trim())} placeholder="(hidden)" spellCheck={false} />
            <button className="btn-gold shrink-0" disabled={busy || mint === (s.PYRAMID_MINT ?? '')} onClick={() => void act(() => api.admin.set(token, 'PYRAMID_MINT', mint), 'PYRAMID_MINT saved')}>
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-sand-50">Hide a brick</h2>
        <p className="text-sm text-sand-400">Abuse, slurs, scams. A hidden brick keeps its slot but shows as sealed everywhere.</p>
        <input className="field mt-4" placeholder="search by #, ticker, name or mint" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mt-3 divide-y divide-sand-50/[0.06] overflow-hidden rounded-2xl border border-sand-50/[0.08]">
          {hits.map((b) => (
            <li key={b.mint} className="flex items-center gap-3 px-4 py-2.5">
              <span className="num w-12 text-sm text-sand-400">#{b.n}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-sand-50">
                  {b.name} <span className="num text-gold">${b.ticker}</span> {b.sim && <span className="chip ml-1 px-1.5 py-0 text-[9px]">sim</span>}
                </div>
                <div className="num truncate text-[11px] text-sand-400">{b.mint}</div>
              </div>
              <button className={b.hidden ? 'btn-ghost text-sm' : 'btn-ghost text-sm text-bad'} disabled={busy} onClick={() => void act(() => api.admin.hide(token, b.mint, !b.hidden), `#${b.n} ${b.hidden ? 'unhidden' : 'hidden'}`)}>
                {busy ? <Spinner /> : b.hidden ? 'Unhide' : 'Hide'}
              </button>
            </li>
          ))}
          {!hits.length && <li className="px-4 py-6 text-center text-sm text-sand-400">no matches</li>}
        </ul>
      </section>
    </div>
  );
}

function Toggle({ title, sub, on, onChange, disabled, note }: { title: string; sub: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean; note?: string }) {
  return (
    <div className="flex items-start gap-4 p-5">
      <div className="min-w-0 flex-1">
        <div className="font-mono font-semibold text-sand-50">{title}</div>
        <p className="text-sm text-sand-400">{sub}</p>
        {note && <p className="mt-1 text-xs text-gold">{note}</p>}
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full border transition disabled:opacity-50 ${on ? 'border-gold/60 bg-gold/30' : 'border-sand-50/15 bg-night-950'}`}
      >
        <span className={`absolute top-0.5 h-[22px] w-[22px] rounded-full transition-all ${on ? 'left-[22px] bg-gold' : 'left-0.5 bg-sand-400'}`} />
      </button>
    </div>
  );
}
