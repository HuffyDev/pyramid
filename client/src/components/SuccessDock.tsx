import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { LaunchView } from '../../../shared/launch';
import { useCopy } from '../lib/hooks';
import { links, short } from '../lib/format';
import { downloadBlob, renderBrickCard } from '../lib/cardImage';
import { getPyramid } from '../lib/pyramid';
import { useConfig } from '../lib/config';
import { BrickTile } from './BrickTile';
import { Icon, Spinner } from './Icon';

/** After a launch: the sheet closes, the brick drops into the pyramid, and this card stays with you. */
export function SuccessDock({ launch, imageUrl, onClose }: { launch: LaunchView; imageUrl: string | null; onClose: () => void }) {
  const n = launch.brickNo;
  const { copied, copy } = useCopy();
  const [busy, setBusy] = useState(false);
  const [cardErr, setCardErr] = useState<string | null>(null);
  const { siteUrl } = useConfig();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const site = (siteUrl || location.origin).replace(/\/$/, '');
  const shareText = `i laid brick #${n ?? '?'} in the pyramid. $${launch.ticker}\n\n${site}/brick/${launch.mint}`;
  const real = !launch.simulated;

  const download = async () => {
    setBusy(true);
    setCardErr(null);
    try {
      const blob = await renderBrickCard({
        n: n ?? 0,
        name: launch.name,
        ticker: launch.ticker,
        mint: launch.mint,
        image: imageUrl ?? launch.imageUri,
        total: getPyramid().bricks.length,
        dryRun: launch.simulated,
      });
      downloadBlob(blob, `pyramid-brick-${n}.png`);
    } catch {
      setCardErr('Could not render the card image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 animate-rise sm:inset-x-auto sm:bottom-6 sm:right-[84px] sm:w-[400px]" role="status">
      <div className="panel relative overflow-hidden !bg-night-850 shadow-gold-lg">
        <div className="pointer-events-none absolute -top-20 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative flex items-start justify-between p-4 pb-2">
          <div>
            <div className="eyebrow text-gold">{launch.simulated ? 'dry run · placed' : launch.status === 'confirmed' ? 'confirmed on-chain' : 'sent · confirming'}</div>
            <div className="display mt-1 text-[28px] leading-none">
              your brick: <span className="gold-text">#{n ?? '…'}</span>
            </div>
          </div>
          <button className="btn-quiet -mr-1 -mt-1 p-1.5" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="relative flex justify-center px-4 py-3">
          <BrickTile width={250} data={{ ticker: launch.ticker, mint: launch.mint, image: imageUrl ?? launch.imageUri, mcap: launch.marketCapUsd, n }} />
        </div>
        <div className="relative space-y-2 p-4 pt-1">
          <button onClick={() => copy(launch.mint)} className="flex w-full items-center gap-3 rounded-xl border border-sand-50/10 bg-night-950/60 px-3 py-2.5 text-left transition hover:border-gold/50">
            <span className="font-mono text-[10px] uppercase tracking-widest text-sand-400">CA</span>
            <span className="num min-w-0 flex-1 truncate text-[12.5px] text-sand-100">{short(launch.mint, 10)}</span>
            <span className={`flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest ${copied ? 'text-gold' : 'text-sand-400'}`}>
              <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'copied' : 'copy'}
            </span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <a className="btn-gold" href={links.tweet(shareText)} target="_blank" rel="noreferrer">
              <Icon name="xlogo" size={14} /> Share on X
            </a>
            <button className="btn-ghost" onClick={download} disabled={busy}>
              {busy ? <Spinner /> : <Icon name="download" />} Brick card
            </button>
          </div>
          {cardErr && <p className="text-xs text-bad">{cardErr}</p>}
          <div className="flex items-center justify-between pt-1 text-[13px]">
            {pathname !== '/' ? (
              <button className="text-gold hover:text-gold-hot" onClick={() => nav(`/?brick=${n}`)}>
                See it in the pyramid →
              </button>
            ) : (
              <Link className="text-gold hover:text-gold-hot" to={`/brick/${launch.mint}`}>
                Brick page →
              </Link>
            )}
            {real && launch.signature && (
              <a className="text-sand-400 hover:text-sand-100" href={links.solscanTx(launch.signature)} target="_blank" rel="noreferrer">
                Solscan ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
