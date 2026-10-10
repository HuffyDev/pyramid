import { BRICK_H, BRICK_W, slotOf, rowOf, rowStart, PITCH_X, PITCH_Y } from '../../../shared/pyramid';
import { drawBrickSurface, hash, sigil, VARIANTS, drawCapstone } from '../pyramid/sprites';
import { short } from './format';

const loadImg = (src: string) =>
  new Promise<HTMLImageElement | null>((res) => {
    const i = new Image();
    // blob: URLs (our own upload) never taint; remote images need CORS to be exportable
    if (!src.startsWith('blob:') && !src.startsWith('data:')) i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });

/** 1200×675 "i laid brick #N" card, rendered client-side. */
export async function renderBrickCard(d: { n: number; name: string; ticker: string; mint: string; image?: string | null; total: number; dryRun?: boolean }): Promise<Blob> {
  await document.fonts?.ready;
  const W = 1200;
  const H = 675;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  // sky
  const sky = x.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0b0f26');
  sky.addColorStop(1, '#04050c');
  x.fillStyle = sky;
  x.fillRect(0, 0, W, H);
  let seed = hash(d.mint);
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 160; i++) {
    x.fillStyle = `rgba(230,230,255,${0.1 + r() * 0.5})`;
    x.fillRect(r() * W, r() * H * 0.7, r() < 0.1 ? 2 : 1, r() < 0.1 ? 2 : 1);
  }

  // mini pyramid on the right with the brick highlighted
  const total = Math.max(d.total, d.n);
  const rows = rowOf(total) + 1;
  const scale = Math.min(520 / (rows * PITCH_X), 470 / (rows * PITCH_Y + 80), 1.2);
  const ox = 890;
  const oy = 140 + 60 * scale;
  const halo = x.createRadialGradient(ox, oy - 40 * scale, 0, ox, oy, 420);
  halo.addColorStop(0, 'rgba(255,190,80,0.35)');
  halo.addColorStop(1, 'rgba(255,190,80,0)');
  x.fillStyle = halo;
  x.fillRect(0, 0, W, H);
  x.save();
  x.translate(ox, oy);
  x.scale(scale, scale);
  drawCapstone(x, 0, -BRICK_H / 2 - 3 - BRICK_H * 0.75, BRICK_W * 1.05, BRICK_H * 1.5, 1500);
  for (let n = 1; n <= total; n++) {
    const s = slotOf(n);
    const me = n === d.n;
    x.fillStyle = me ? '#ffc94d' : '#a9844f';
    x.globalAlpha = me ? 1 : 0.75;
    x.fillRect(s.x - BRICK_W / 2, s.y - BRICK_H / 2, BRICK_W, BRICK_H);
  }
  x.globalAlpha = 1;
  const me = slotOf(d.n);
  x.strokeStyle = '#fff1c4';
  x.lineWidth = 6 / scale;
  x.strokeRect(me.x - BRICK_W / 2 - 4, me.y - BRICK_H / 2 - 4, BRICK_W + 8, BRICK_H + 8);
  x.restore();
  void rowStart;

  // the brick itself, big
  const BW = 520;
  const BH = (BW * BRICK_H) / BRICK_W;
  const bx = 70;
  const by = 300;
  x.save();
  x.shadowColor = 'rgba(255,170,40,0.45)';
  x.shadowBlur = 70;
  x.fillStyle = '#000';
  x.fillRect(bx + 10, by + 10, BW - 20, BH - 20);
  x.restore();
  x.save();
  x.translate(bx, by);
  drawBrickSurface(x, BW, BH, { glow: 0.55, crack: 0, variant: hash(d.mint) % VARIANTS });
  const S = BW / BRICK_W;
  x.scale(S, S);
  const img = d.image ? await loadImg(d.image) : null;
  const pad = 6;
  const im = BRICK_H - pad * 2;
  try {
    x.drawImage(img ?? sigil(d.mint, d.ticker), pad, pad, im, im);
  } catch {
    x.drawImage(sigil(d.mint, d.ticker), pad, pad, im, im);
  }
  x.strokeStyle = 'rgba(40,22,6,0.55)';
  x.lineWidth = 0.6;
  x.strokeRect(pad, pad, im, im);
  x.fillStyle = '#2a1806';
  x.font = '700 15px "Hanken Grotesk", sans-serif';
  x.fillText(`$${d.ticker}`, pad + im + 7, 23);
  x.font = '500 9px "JetBrains Mono", monospace';
  x.fillStyle = 'rgba(42,24,6,0.75)';
  x.fillText(d.name.slice(0, 22), pad + im + 7, 37);
  x.restore();

  // text
  x.fillStyle = '#ffb52e';
  x.font = '600 20px "JetBrains Mono", monospace';
  x.fillText(d.dryRun ? 'PYRAMID  ·  DRY RUN' : 'PYRAMID  ·  BRICK PLACED', 70, 96);
  x.fillStyle = '#fbf4e4';
  x.font = '700 82px Cinzel, Georgia, serif';
  x.fillText(`brick #${d.n}`, 66, 190);
  x.fillStyle = '#d5b072';
  x.font = '500 30px "Hanken Grotesk", sans-serif';
  x.fillText(`i laid brick #${d.n} in the pyramid.`, 70, 245);
  x.fillStyle = '#7a7f9f';
  x.font = '400 18px "JetBrains Mono", monospace';
  x.fillText(`CA ${short(d.mint, 10)}`, 70, 600);
  x.fillStyle = '#a7a7bb';
  x.font = '600 18px Cinzel, Georgia, serif';
  x.textAlign = 'right';
  x.fillText('every coin is a brick.', W - 60, 620);

  return new Promise((res, rej) => {
    try {
      c.toBlob((b) => (b ? res(b) : rej(new Error('render failed'))), 'image/png');
    } catch (e) {
      rej(e);
    }
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
