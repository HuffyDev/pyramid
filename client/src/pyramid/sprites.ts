/**
 * Pre-rendered brick surfaces. Everything expensive (gradients, glyph texture, cracks,
 * stone grain) is drawn once per (glow tier × crack level × variant) into an offscreen
 * canvas, so a frame with 1,000+ bricks is just drawImage calls.
 */
import { BRICK_H, BRICK_W, glowOf } from '../../../shared/pyramid';

export const SPRITE_SCALE = 2;
export const GLOW_TIERS = 6;
export const VARIANTS = 3;

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const SAND = { top: hex('#cfa96c'), bot: hex('#9b7443'), hi: hex('#ecd4a2'), lo: hex('#5a4125') };
const GOLD = { top: hex('#ffd97c'), bot: hex('#d3901d'), hi: hex('#fff2c8'), lo: hex('#86560b') };
const DEAD: RGB = hex('#3e362e');

export function brickColors(glow: number, crack: number) {
  const t = Math.pow(glow, 0.85);
  let top = mix(SAND.top, GOLD.top, t);
  let bot = mix(SAND.bot, GOLD.bot, t);
  let hi = mix(SAND.hi, GOLD.hi, t);
  let lo = mix(SAND.lo, GOLD.lo, t);
  if (crack > 0) {
    const d = 0.32 + crack * 0.12;
    top = mix(top, DEAD, d);
    bot = mix(bot, DEAD, d);
    hi = mix(hi, DEAD, d * 0.9);
    lo = mix(lo, DEAD, d * 0.5);
  }
  return { top, bot, hi, lo };
}

export const tierOf = (mcap: number | null | undefined) => Math.min(GLOW_TIERS - 1, Math.round(glowOf(mcap) * (GLOW_TIERS - 1)));

function roundRect(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + w, Y, X + w, Y + h, r);
  x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r);
  x.arcTo(X, Y, X + w, Y, r);
  x.closePath();
}

/** faint engraved glyphs: abstract marks on a grid, hieroglyph-like without copying any real sign */
function glyphs(x: CanvasRenderingContext2D, w: number, h: number, r: () => number, dark: string, light: string) {
  const cell = 13 * SPRITE_SCALE * 0.5 * 2;
  const pad = 5 * SPRITE_SCALE;
  x.lineWidth = SPRITE_SCALE * 0.7;
  x.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    x.strokeStyle = pass === 0 ? light : dark;
    x.fillStyle = pass === 0 ? light : dark;
    const oy = pass === 0 ? SPRITE_SCALE * 0.6 : 0;
    const rr = rng(Math.floor(r() * 1e9));
    for (let gy = pad; gy + cell <= h - pad; gy += cell) {
      for (let gx = pad; gx + cell <= w - pad; gx += cell) {
        const k = Math.floor(rr() * 9);
        const cx = gx + cell / 2;
        const cy = gy + cell / 2 + oy;
        const s = cell * 0.3;
        x.beginPath();
        switch (k) {
          case 0:
            x.arc(cx, cy, s * 0.8, 0, Math.PI * 2);
            break;
          case 1:
            x.moveTo(cx, cy - s);
            x.lineTo(cx, cy + s);
            break;
          case 2:
            x.moveTo(cx - s, cy - s * 0.4);
            x.lineTo(cx + s, cy - s * 0.4);
            x.moveTo(cx - s, cy + s * 0.4);
            x.lineTo(cx + s, cy + s * 0.4);
            break;
          case 3:
            x.moveTo(cx, cy - s);
            x.lineTo(cx + s, cy + s * 0.8);
            x.lineTo(cx - s, cy + s * 0.8);
            x.closePath();
            break;
          case 4:
            x.moveTo(cx - s, cy);
            for (let i = 1; i <= 4; i++) x.lineTo(cx - s + (i * s) / 2, cy + (i % 2 ? -s * 0.5 : s * 0.5));
            break;
          case 5:
            x.ellipse(cx, cy, s, s * 0.45, 0, 0, Math.PI * 2);
            x.moveTo(cx + s * 0.18, cy);
            x.arc(cx, cy, s * 0.18, 0, Math.PI * 2);
            break;
          case 6:
            x.arc(cx, cy + s * 0.4, s * 0.8, Math.PI, 0);
            break;
          case 7:
            x.moveTo(cx - s * 0.6, cy - s);
            x.lineTo(cx - s * 0.6, cy + s);
            x.lineTo(cx + s * 0.6, cy + s);
            break;
          default:
            x.rect(cx - s * 0.6, cy - s * 0.6, s * 1.2, s * 1.2);
        }
        x.stroke();
      }
    }
  }
}

function cracks(x: CanvasRenderingContext2D, w: number, h: number, level: number, r: () => number) {
  const S = SPRITE_SCALE;
  const line = (pts: [number, number][], width: number) => {
    x.beginPath();
    pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.lineJoin = 'round';
    x.strokeStyle = 'rgba(255,235,200,0.16)';
    x.lineWidth = width * S;
    x.save();
    x.translate(S * 0.8, S * 0.8);
    x.stroke();
    x.restore();
    x.strokeStyle = 'rgba(12,8,4,0.92)';
    x.lineWidth = width * S;
    x.stroke();
  };
  const path = (x0: number, y0: number, dx: number, dy: number, steps: number): [number, number][] => {
    const pts: [number, number][] = [[x0, y0]];
    let px = x0;
    let py = y0;
    for (let i = 0; i < steps; i++) {
      px += dx / steps + (r() - 0.5) * 10 * S;
      py += dy / steps + (r() - 0.5) * 4 * S;
      pts.push([px, py]);
    }
    return pts;
  };
  const main = path(w * (0.3 + r() * 0.4), 0, (r() - 0.5) * w * 0.3, h, 6);
  line(main, 1.4);
  if (level >= 2) {
    const mid = main[3];
    line(path(mid[0], mid[1], (r() > 0.5 ? 1 : -1) * w * 0.35, h * 0.35, 4), 1.1);
    line(path(w * (0.75 + r() * 0.2), h, -w * 0.15, -h * 0.6, 4), 0.9);
  }
  if (level >= 3) {
    // a chipped corner
    x.save();
    x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    const left = r() > 0.5;
    const cx = left ? 0 : w;
    x.moveTo(cx, h * (0.35 + r() * 0.2));
    x.lineTo(cx + (left ? 1 : -1) * w * (0.12 + r() * 0.06), h);
    x.lineTo(cx, h);
    x.closePath();
    x.fill();
    x.restore();
    line(path(w * (0.1 + r() * 0.8), 0, (r() - 0.5) * w * 0.2, h * 0.7, 5), 1.2);
  }
}

/** Draw a full brick surface into ctx at (0,0,w,h) in pixels. Also used for previews and the share card. */
export function drawBrickSurface(x: CanvasRenderingContext2D, w: number, h: number, o: { glow: number; crack: number; variant: number; hidden?: boolean }) {
  const S = w / BRICK_W; // pixel per world unit
  const c = brickColors(o.hidden ? 0 : o.glow, o.crack);
  const r = rng(1013 + o.variant * 7919 + o.crack * 31);
  const rad = 3 * S;
  x.save();
  roundRect(x, 0, 0, w, h, rad);
  x.clip();
  // body
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, css(c.top));
  g.addColorStop(1, css(c.bot));
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // horizontal sediment banding
  for (let i = 0; i < 5; i++) {
    x.fillStyle = `rgba(${i % 2 ? '255,240,210' : '60,35,10'},${0.025 + r() * 0.03})`;
    x.fillRect(0, r() * h, w, (1 + r() * 4) * S);
  }
  // stone grain
  const grains = Math.round((w * h) / (18 * S * S));
  for (let i = 0; i < grains; i++) {
    x.fillStyle = r() > 0.5 ? `rgba(255,245,220,${r() * 0.12})` : `rgba(40,22,6,${r() * 0.14})`;
    const d = (0.4 + r() * 0.9) * S;
    x.fillRect(r() * w, r() * h, d, d);
  }
  if (!o.hidden) glyphs(x, w, h, r, 'rgba(55,30,8,0.16)', 'rgba(255,244,214,0.10)');
  else {
    // sealed: a plain cartouche outline
    x.strokeStyle = 'rgba(30,18,6,0.35)';
    x.lineWidth = 1.2 * S;
    roundRect(x, w * 0.18, h * 0.3, w * 0.64, h * 0.4, h * 0.2);
    x.stroke();
  }
  // bevel
  x.fillStyle = css(c.hi, 0.75);
  x.fillRect(0, 0, w, 1.6 * S);
  x.fillStyle = css(c.hi, 0.3);
  x.fillRect(0, 0, 1.2 * S, h);
  x.fillStyle = css(c.lo, 0.85);
  x.fillRect(0, h - 2.6 * S, w, 2.6 * S);
  x.fillStyle = css(c.lo, 0.5);
  x.fillRect(w - 1.4 * S, 0, 1.4 * S, h);
  // gold tiers get a soft inner sheen
  if (o.glow > 0.35 && !o.hidden && !o.crack) {
    const sh = x.createLinearGradient(0, 0, w, h);
    sh.addColorStop(0, 'rgba(255,255,255,0)');
    sh.addColorStop(0.45, `rgba(255,250,225,${0.12 * o.glow})`);
    sh.addColorStop(0.55, 'rgba(255,255,255,0)');
    x.fillStyle = sh;
    x.fillRect(0, 0, w, h);
  }
  if (o.crack > 0) cracks(x, w, h, o.crack, r);
  x.restore();
}

const spriteCache = new Map<string, HTMLCanvasElement>();
export function brickSprite(tier: number, crack: number, variant: number, hidden: boolean): HTMLCanvasElement {
  const key = hidden ? `h${variant}` : `${tier}:${crack}:${variant}`;
  let c = spriteCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = BRICK_W * SPRITE_SCALE;
    c.height = BRICK_H * SPRITE_SCALE;
    drawBrickSurface(c.getContext('2d')!, c.width, c.height, { glow: tier / (GLOW_TIERS - 1), crack, variant, hidden });
    spriteCache.set(key, c);
  }
  return c;
}

let glowSpriteC: HTMLCanvasElement | null = null;
export function glowSprite() {
  if (glowSpriteC) return glowSpriteC;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,196,80,0.85)');
  g.addColorStop(0.35, 'rgba(255,170,40,0.32)');
  g.addColorStop(1, 'rgba(255,150,20,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  return (glowSpriteC = c);
}

// mineral pigments: lapis, malachite, ochre, carnelian, turquoise, obsidian, faience
const PIGMENTS = ['#26407d', '#2d6e57', '#b9702a', '#9c3b27', '#2f8b8b', '#1d1c26', '#3f6fa8', '#7a4a8a'];

const sigilCache = new Map<string, HTMLCanvasElement>();
/** Procedural coin art for bricks without an image (SIM bricks, hidden-image fallbacks). */
export function sigil(mint: string, ticker: string, size = 96): HTMLCanvasElement {
  const key = `${mint}:${size}`;
  const hit = sigilCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  const r = rng(hash(mint));
  const bg = PIGMENTS[Math.floor(r() * PIGMENTS.length)];
  const g = x.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, bg);
  g.addColorStop(1, '#0b0b14');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  x.strokeStyle = 'rgba(255,214,140,0.55)';
  x.fillStyle = 'rgba(255,214,140,0.85)';
  x.lineWidth = size / 40;
  const m = size / 2;
  const kind = Math.floor(r() * 4);
  if (kind === 0) {
    x.beginPath();
    x.arc(m, m * 0.9, size * 0.22, 0, Math.PI * 2);
    x.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      x.beginPath();
      x.moveTo(m + Math.cos(a) * size * 0.28, m * 0.9 + Math.sin(a) * size * 0.28);
      x.lineTo(m + Math.cos(a) * size * 0.36, m * 0.9 + Math.sin(a) * size * 0.36);
      x.stroke();
    }
  } else if (kind === 1) {
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.moveTo(m, size * (0.14 + i * 0.07));
      x.lineTo(size * (0.82 - i * 0.03), size * 0.78);
      x.lineTo(size * (0.18 + i * 0.03), size * 0.78);
      x.closePath();
      x.stroke();
    }
  } else if (kind === 2) {
    for (let i = 0; i < 5; i++) {
      x.globalAlpha = 0.3 + i * 0.12;
      x.fillRect(size * 0.16, size * (0.18 + i * 0.13), size * 0.68, size * 0.05);
    }
    x.globalAlpha = 1;
  } else {
    x.beginPath();
    x.ellipse(m, m, size * 0.32, size * 0.16, 0, 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    x.arc(m, m, size * 0.09, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = '#fff3d6';
  x.font = `700 ${Math.round(size * 0.34)}px Cinzel, Georgia, serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = 'rgba(0,0,0,0.6)';
  x.shadowBlur = size / 16;
  x.fillText((ticker || '?').slice(0, 1), m, size * 0.56);
  if (sigilCache.size > 3000) sigilCache.clear();
  sigilCache.set(key, c);
  return c;
}

/** The capstone: a gold pyramidion. (x, y) = center of its bounding box, in current transform units. */
export function drawCapstone(x: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, t: number, hover = false) {
  const top = cy - h / 2;
  const bot = cy + h / 2;
  const L = cx - w / 2;
  const R = cx + w / 2;
  // left face
  const gl = x.createLinearGradient(L, bot, cx, top);
  gl.addColorStop(0, '#e59b1a');
  gl.addColorStop(0.6, '#ffd166');
  gl.addColorStop(1, '#fff2c4');
  x.fillStyle = gl;
  x.beginPath();
  x.moveTo(cx, top);
  x.lineTo(cx - w * 0.06, bot);
  x.lineTo(L, bot);
  x.closePath();
  x.fill();
  // right face (in shade)
  const gr = x.createLinearGradient(R, bot, cx, top);
  gr.addColorStop(0, '#7a4c06');
  gr.addColorStop(0.7, '#c07d0e');
  gr.addColorStop(1, '#f0b43a');
  x.fillStyle = gr;
  x.beginPath();
  x.moveTo(cx, top);
  x.lineTo(R, bot);
  x.lineTo(cx - w * 0.06, bot);
  x.closePath();
  x.fill();
  // engraved courses
  x.save();
  x.beginPath();
  x.moveTo(cx, top);
  x.lineTo(R, bot);
  x.lineTo(L, bot);
  x.closePath();
  x.clip();
  x.strokeStyle = 'rgba(90,50,0,0.35)';
  x.lineWidth = Math.max(0.5, h / 70);
  for (let i = 1; i < 5; i++) {
    const yy = top + (h * i) / 5;
    x.beginPath();
    x.moveTo(L, yy);
    x.lineTo(R, yy);
    x.stroke();
  }
  // moving glint
  const p = (t / 4200) % 1;
  const gx = L + (R - L) * (p * 1.6 - 0.3);
  const glint = x.createLinearGradient(gx - w * 0.15, top, gx + w * 0.15, bot);
  glint.addColorStop(0, 'rgba(255,255,255,0)');
  glint.addColorStop(0.5, 'rgba(255,255,240,0.45)');
  glint.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = glint;
  x.fillRect(L, top, w, h);
  x.restore();
  // ridge highlight
  x.strokeStyle = hover ? '#fffbe8' : 'rgba(255,248,220,0.9)';
  x.lineWidth = Math.max(0.6, h / 45);
  x.beginPath();
  x.moveTo(cx, top);
  x.lineTo(cx - w * 0.06, bot);
  x.stroke();
  // base edge
  x.fillStyle = 'rgba(60,30,0,0.55)';
  x.fillRect(L, bot - Math.max(0.5, h / 40), w, Math.max(0.5, h / 40));
}
