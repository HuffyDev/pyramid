import { Link } from 'react-router-dom';
import { connectDiscord, connectWallet, runBuyback } from '../lib/actions';
import { DCM_CA, DCM_PUMP_URL, DCM_X_URL, SAMPLE_DCM_PER_SOL, userById } from '../lib/fixtures';
import { compact, dateTime, int, shortAddr, solLabel } from '../lib/format';
import { platformTotals } from '../lib/ledger';
import { resetDemo, useDemo } from '../lib/store';
import { Icon, XGlyph } from './Icon';
import { ConfirmDialog, Drawer, Modal } from './Overlay';
import { useToast } from './Toast';
import { useUI } from './UIState';
import { Avatar, CopyButton, KV, MonoId, Notice, SampleTag, cx } from './ui';

export function GlobalPanels() {
  const ui = useUI();
  const toast = useToast();
  return (
    <>
      <ConnectModal />
      <TokenOverview />
      <HistoryDrawer />
      <ConfirmDialog
        open={ui.panel === 'reset'}
        onClose={ui.close}
        title="Reset the demo?"
        tone="danger"
        confirmLabel="Reset demo"
        body={
          <p>
            This clears every launch, payout, claim and offer you created in this browser and restores the original sample data. Nothing real is affected.
          </p>
        }
        onConfirm={() => {
          resetDemo();
          toast.success('Demo reset', 'Sample data restored.');
        }}
      />
    </>
  );
}

function ConnectModal() {
  const ui = useUI();
  const s = useDemo();
  const toast = useToast();
  const wallet = userById(s.session.walletUserId);
  const discord = userById(s.session.discordUserId);
  const opt = 'group flex w-full items-center gap-3 rounded-lg border border-black/30 bg-card px-4 py-3.5 text-left transition-colors hover:border-blurple/60 hover:bg-hover disabled:cursor-default disabled:hover:border-black/30 disabled:hover:bg-card';
  return (
    <Modal open={ui.panel === 'connect'} onClose={ui.close} title="Connect demo" description="Pick a simulated connection. A fictional identity is assigned — you can switch it later from the account menu." size="sm">
      <div className="grid gap-2.5">
        <button
          type="button"
          className={opt}
          disabled={Boolean(wallet)}
          onClick={() => {
            connectWallet();
            toast.success('Demo wallet connected', 'Fictional address — no keys involved.');
            ui.close();
          }}
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blurple/20 text-blurple-light">
            <Icon name="wallet" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink">Use demo wallet</span>
            <span className="block text-[12.5px] text-ink-mute">{wallet ? `Connected · ${shortAddr(wallet.wallet)}` : 'A fictional Solana-style address'}</span>
          </span>
          {wallet ? <Icon name="check" className="text-mint-bright" /> : <Icon name="chevronRight" className="text-ink-mute group-hover:text-ink" />}
        </button>
        <button
          type="button"
          className={opt}
          disabled={Boolean(discord)}
          onClick={() => {
            connectDiscord();
            toast.success('Demo Discord connected', 'Fictional profile — no permissions requested.');
            ui.close();
          }}
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blurple text-white">
            <Icon name="chat" size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink">Connect demo Discord</span>
            <span className="block text-[12.5px] text-ink-mute">{discord ? `Connected · @${discord.username}` : 'A fictional username, ID and avatar'}</span>
          </span>
          {discord ? <Icon name="check" className="text-mint-bright" /> : <Icon name="chevronRight" className="text-ink-mute group-hover:text-ink" />}
        </button>
      </div>
      <div className="mt-4">
        <Notice icon="lock">
          Connections are <b className="text-ink">simulated in your browser</b>. DiscordMoney never asks for passwords, private keys, signatures or Discord permissions in this demo.
        </Notice>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" className="btn-ghost" onClick={ui.close}>
          Close
        </button>
      </div>
    </Modal>
  );
}

function TokenOverview() {
  const ui = useUI();
  const s = useDemo();
  const p = platformTotals(s);
  return (
    <Drawer open={ui.panel === 'token'} onClose={ui.close} title="$DCM token overview" subtitle="Solana contract address & demo flywheel">
      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-black/20 bg-gradient-to-br from-blurple/25 to-transparent p-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blurple text-lg font-black text-white">D</span>
          <div className="min-w-0">
            <div className="text-lg font-bold text-ink">DiscordMoney ($DCM)</div>
            <MonoId value={shortAddr(DCM_CA, 8, 8)} copy={false} />
          </div>
        </div>
        <div className="divide-y divide-line/50 px-4">
          <KV k="Contract address" v={<span className="inline-flex items-center"><span className="mono">{shortAddr(DCM_CA, 6, 6)}</span><CopyButton value={DCM_CA} iconOnly label="Copy CA" toast="Contract address copied" /></span>} />
          <KV k="X" v={<a href={DCM_X_URL} target="_blank" rel="noreferrer noopener" className="link">@Payondiscord</a>} />
          <KV k="Chart" v={<a href={DCM_PUMP_URL} target="_blank" rel="noreferrer noopener" className="link">pump.fun</a>} />
          <KV k="Demo exchange rate" v={`${int(SAMPLE_DCM_PER_SOL)} $DCM / SOL (sample)`} />
          <KV k="Simulated burned (demo ledger)" v={`${int(p.burned)} $DCM`} />
          <KV k="Simulated buybacks" v={p.count} />
        </div>
      </div>
      <h3 className="mb-2 mt-6 text-[13px] font-bold uppercase tracking-wide text-ink-soft">Platform revenue (demo ledger)</h3>
      <div className="grid grid-cols-2 gap-2">
        <Mini label="Collected" value={solLabel(p.revenue)} />
        <Mini label="Spent on buybacks" value={solLabel(p.spent)} />
        <Mini label="Available" value={solLabel(p.available)} tone="mint" />
        <Mini label="$DCM burned" value={compact(p.burned)} tone="fuchsia" />
      </div>
      <div className="mt-6 grid gap-2 text-[13px] text-ink-mute">
        <p>
          The platform keeps <b className="text-ink-body">10%</b> of every launch-fee event (rounded down in lamports). In this demo, that share funds simulated $DCM buybacks which are then burned.
        </p>
        <p>Buyback, burn and revenue figures on this site come from the local demo ledger — they are not on-chain activity for the $DCM contract and are not a promise of future buybacks. Always verify the contract address yourself.</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => ui.open('history')}>
          <Icon name="flame" size={15} /> View demo history
        </button>
        <CopyButton value={DCM_CA} label="Copy CA" toast="Contract address copied" className="btn-outline !text-ink-body" />
        <a href={DCM_X_URL} target="_blank" rel="noreferrer noopener" className="btn-outline">
          <XGlyph size={13} /> Follow on X
        </a>
      </div>
    </Drawer>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'mint' | 'fuchsia' }) {
  return (
    <div className="inset px-3 py-2.5">
      <div className="kpi">{label}</div>
      <div className={cx('mt-1 text-[15px] font-bold', tone === 'mint' ? 'text-mint-bright' : tone === 'fuchsia' ? 'text-[#F68BC4]' : 'text-ink')}>{value}</div>
    </div>
  );
}

export function HistoryDrawer() {
  const ui = useUI();
  const s = useDemo();
  const toast = useToast();
  const p = platformTotals(s);
  const rows = [...s.buybacks].sort((a, b) => b.at - a.at);
  return (
    <Drawer
      open={ui.panel === 'history'}
      onClose={ui.close}
      title="Buyback & burn history"
      subtitle={`Sample rate ${int(SAMPLE_DCM_PER_SOL)} $DCM per SOL · demo receipts`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12px] text-ink-mute">
            Available: <span className="font-semibold text-mint-bright">{solLabel(p.available)}</span>
          </div>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={p.available <= 0}
            onClick={() => {
              const r = runBuyback();
              if (r.ok) toast.success('Simulated buyback & burn', `${int(r.value.dcmBurned)} sample $DCM burned.`);
              else toast.error('Buyback not possible', r.error);
            }}
          >
            <Icon name="flame" size={14} /> Simulate buyback
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <Mini label="Collected" value={solLabel(p.revenue, 2)} />
        <Mini label="Spent" value={solLabel(p.spent, 2)} />
        <Mini label="Burned" value={compact(p.burned)} tone="fuchsia" />
      </div>
      <p className="mt-3 text-[12px] text-ink-mute">Buybacks can only spend platform revenue that has not been spent yet. Generate sample fees on a launch to add more.</p>
      <ol className="mt-4 grid gap-2">
        {rows.length === 0 && <li className="inset px-4 py-6 text-center text-sm text-ink-mute">No buybacks yet.</li>}
        {rows.map((b) => (
          <li key={b.id} className="inset p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                <Icon name="flame" size={14} className="text-[#F68BC4]" />
                {int(b.dcmBurned)} $DCM burned
              </span>
              <SampleTag sample={b.sample} label={b.sample ? 'Sample data' : 'Demo receipt'} />
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-x-3 text-[12px] text-ink-mute">
              <span>Spent {solLabel(b.solSpent)}</span>
              <span className="text-right">{dateTime(b.at)}</span>
            </div>
            <div className="mt-1.5">
              <MonoId value={b.receipt} />
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-5 text-[12px] text-ink-mute">
        Want more revenue? Open any launch on <Link to="/launches" onClick={ui.close} className="link">Launches</Link> and use “Generate sample fees”.
      </div>
    </Drawer>
  );
}

export function IdentityLine({ userId }: { userId: string | null }) {
  const u = userById(userId);
  if (!u) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar user={u} size={20} />
      <span className="text-ink-body">@{u.username}</span>
    </span>
  );
}
