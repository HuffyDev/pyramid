import { useEffect, useRef } from 'react';
import { BRICK_H, BRICK_W } from '../../../shared/pyramid';
import { drawBrickSurface, hash, sigil, VARIANTS } from '../pyramid/sprites';
import { usdShort } from '../pyramid/renderer';
import { glowOf } from '../../../shared/pyramid';

export interface TileData {
  ticker: string;
  mint?: string;
  image?: string | null;
  mcap?: number | null;
  crack?: number;
  hidden?: boolean;
  n?: number | null;
  /** caption under the ticker instead of mcap */
  caption?: string;
}

/** A single brick rendered with the exact same surface as the pyramid (previews, cards, tables). */
export function BrickTile({ data, width = 240, className = '' }: { data: TileData; width?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(data);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let live = true;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const h = (width * BRICK_H) / BRICK_W;
    c.width = Math.round(width * dpr);
    c.height = Math.round(h * dpr);
    let img: CanvasImageSource | null = null;
    const draw = () => {
      if (!live) return;
      const x = c.getContext('2d')!;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.textAlign = 'left'; // context state survives redraws
      x.globalAlpha = 1;
      x.clearRect(0, 0, c.width, c.height);
      const seed = data.mint ?? data.ticker;
      drawBrickSurface(x, c.width, c.height, { glow: glowOf(data.mcap), crack: data.crack ?? 0, variant: hash(seed) % VARIANTS, hidden: data.hidden });
      const S = c.width / BRICK_W;
      x.setTransform(S, 0, 0, S, 0, 0);
      if (data.hidden) {
        x.fillStyle = 'rgba(30,18,6,0.55)';
        x.font = '600 9px "JetBrains Mono", monospace';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText('SEALED', BRICK_W / 2, BRICK_H / 2);
        return;
      }
      const pad = 6;
      const im = BRICK_H - pad * 2;
      x.globalAlpha = data.crack ? 0.55 : 1;
      x.drawImage(img ?? sigil(seed, data.ticker || '?'), pad, pad, im, im);
      x.globalAlpha = 1;
      x.strokeStyle = 'rgba(40,22,6,0.55)';
      x.lineWidth = 0.8;
      x.strokeRect(pad + 0.4, pad + 0.4, im - 0.8, im - 0.8);
      const tx = pad + im + 7;
      const maxW = BRICK_W - tx - 6;
      const tk = data.ticker || 'TICKER';
      x.font = '700 14px "Hanken Grotesk", sans-serif';
      const w = x.measureText(tk).width;
      x.font = `700 ${Math.min(14, (14 * maxW) / Math.max(1, w)).toFixed(1)}px "Hanken Grotesk", sans-serif`;
      x.fillStyle = data.ticker ? '#2a1806' : 'rgba(42,24,6,0.35)';
      x.textBaseline = 'alphabetic';
      x.fillText(tk, tx, 22);
      x.font = '500 10px "JetBrains Mono", monospace';
      x.fillStyle = 'rgba(42,24,6,0.78)';
      x.fillText(data.caption ?? (data.crack ? 'cracked' : data.mcap == null ? 'fresh' : usdShort(data.mcap)), tx, 37);
      if (data.n) {
        x.font = '500 7px "JetBrains Mono", monospace';
        x.fillStyle = 'rgba(42,24,6,0.55)';
        x.textAlign = 'right';
        x.fillText(`#${data.n}`, BRICK_W - 5, BRICK_H - 7);
      }
    };
    draw();
    if (data.image) {
      const i = new Image();
      i.onload = () => {
        img = i;
        draw();
      };
      i.src = data.image;
    }
    document.fonts?.ready.then(draw).catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width]);
  return <canvas ref={ref} className={className} style={{ width, height: (width * BRICK_H) / BRICK_W }} aria-hidden />;
}
