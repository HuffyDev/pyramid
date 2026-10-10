/**
 * Canvas 2D pyramid renderer.
 *  - O(visible) per frame: rows/cols in view are computed from the camera, never a full scan
 *  - brick surfaces are cached sprites (see sprites.ts); images are downscaled once on load
 *  - level of detail: sprite only → + image → + ticker / mcap, by on-screen brick size
 *  - pan (drag / one finger when zoomed in), pinch, ctrl/⌘ + wheel, double-tap, buttons
 *  - drop-in animation with weight, bounce and dust; ambient motes + capstone light
 *  - prefers-reduced-motion: no ambient motion, bricks fade in instead of falling
 */
import {
  BRICK_H,
  BRICK_W,
  GAP,
  PITCH_X,
  PITCH_Y,
  bounds,
  capstone,
  crackLevel,
  fillOrder,
  glowOf,
  hitTest,
  rowOf,
  rowStart,
  slotOf,
  type BrickView,
} from '../../../shared/pyramid';
import { brickSprite, drawCapstone, glowSprite, hash, sigil, tierOf, VARIANTS } from './sprites';

export type Pick = { kind: 'brick'; n: number; rect: Rect } | { kind: 'cap'; rect: Rect };
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RendererOpts {
  reducedMotion: boolean;
  onHover?: (p: Pick | null) => void;
  onSelect?: (p: Pick | null) => void;
  onZoomed?: (zoomedIn: boolean) => void;
  onHint?: (msg: string) => void;
  /** reserve screen space (px) the hero overlays cover */
  inset?: { top: number; bottom: number };
  /** compact = mini map (brick page): no interaction, no ambient */
  compact?: boolean;
}

interface Cam {
  x: number;
  y: number;
  s: number;
}

interface Drop {
  t0: number;
  fromY: number;
  impacted: boolean;
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  age: number;
}

interface Mote {
  x: number;
  y: number;
  r: number;
  a: number;
  v: number;
  ph: number;
}

const DROP_FALL = 620;
const DROP_TOTAL = 1150;

const inverseCache = new Map<number, Int32Array>();
function posIndex(slots: number) {
  let inv = inverseCache.get(slots);
  if (!inv) {
    inv = new Int32Array(slots);
    fillOrder(slots).forEach((col, k) => (inv![col] = k));
    if (inverseCache.size < 8192) inverseCache.set(slots, inv);
  }
  return inv;
}

class ImageCache {
  private m = new Map<string, HTMLCanvasElement | 'loading' | 'error'>();
  private active = 0;
  private queue: string[] = [];
  constructor(private onLoad: () => void) {}
  get(url: string): HTMLCanvasElement | null {
    const v = this.m.get(url);
    if (v instanceof HTMLCanvasElement) return v;
    if (v === undefined) {
      this.m.set(url, 'loading');
      this.queue.push(url);
      this.pump();
    }
    return null;
  }
  private pump() {
    while (this.active < 6 && this.queue.length) {
      const url = this.queue.pop()!; // newest request first (what is on screen now)
      this.active++;
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = 96;
        const x = c.getContext('2d')!;
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        x.imageSmoothingQuality = 'high';
        x.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 96, 96);
        this.m.set(url, c);
        this.done();
      };
      img.onerror = () => {
        this.m.set(url, 'error');
        this.done();
      };
      img.src = url;
    }
  }
  private done() {
    this.active--;
    this.onLoad();
    this.pump();
  }
}

const tickerWidth = new Map<string, number>();

export class PyramidRenderer {
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private bricks: BrickView[] = [];
  private cam: Cam = { x: 0, y: 0, s: 1 };
  private target: Cam = { x: 0, y: 0, s: 1 };
  private fitCam: Cam = { x: 0, y: 0, s: 1 };
  private autoFit = true;
  private drops = new Map<number, Drop>();
  private dust: Dust[] = [];
  private motes: Mote[] = [];
  private stars: HTMLCanvasElement | null = null;
  private hover: Pick | null = null;
  private highlight: { n: number; until: number } | null = null;
  private images: ImageCache;
  private raf = 0;
  private dirty = true;
  private last = 0;
  private shake = 0;
  private ro: ResizeObserver;
  private pointers = new Map<number, { x: number; y: number; t: number; x0: number; y0: number }>();
  private drag: { x: number; y: number; cx: number; cy: number } | null = null;
  private pinch: { d: number; s: number; wx: number; wy: number } | null = null;
  private vel = { x: 0, y: 0 };
  private lastTap = 0;
  private zoomedIn = false;
  private destroyed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: RendererOpts,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: true })!;
    this.images = new ImageCache(() => (this.dirty = true));
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    if (!opts.compact) this.bindInput();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.unbind?.();
  }

  // ── data ───────────────────────────────────────────────────────────────────
  setBricks(bricks: BrickView[]) {
    const grew = bricks.length !== this.bricks.length;
    this.bricks = bricks;
    if (grew) this.computeFit();
    if (grew && this.autoFit) this.target = { ...this.fitCam };
    this.dirty = true;
  }

  /** start the drop-in for brick n (it must already be in setBricks) */
  drop(n: number) {
    const slot = slotOf(n);
    const viewTop = this.cam.y - this.H / 2 / this.cam.s;
    this.drops.set(n, { t0: performance.now(), fromY: Math.min(slot.y - 260, viewTop - BRICK_H * 2) - slot.y, impacted: false });
    this.dirty = true;
  }

  highlightBrick(n: number, ms = 6000) {
    this.highlight = { n, until: performance.now() + ms };
    this.dirty = true;
  }

  focus(n: number, opts: { zoom?: number } = {}) {
    if (n < 1) return;
    const s = slotOf(n);
    this.autoFit = false;
    const z = opts.zoom ?? Math.max(this.fitCam.s * 2.4, Math.min(1.1, this.fitCam.s * 6));
    this.target = { x: s.x, y: s.y, s: this.clampS(z) };
    this.dirty = true;
  }

  fit() {
    this.autoFit = true;
    this.computeFit();
    this.target = { ...this.fitCam };
    this.dirty = true;
  }

  zoomBy(f: number, sx = this.W / 2, sy = this.H / 2) {
    this.autoFit = false;
    const t = this.target;
    const ns = this.clampS(t.s * f);
    // keep the world point under (sx, sy) fixed
    const wx = t.x + (sx - this.W / 2) / t.s;
    const wy = t.y + (sy - this.H / 2) / t.s;
    this.target = { s: ns, x: wx - (sx - this.W / 2) / ns, y: wy - (sy - this.H / 2) / ns };
    this.dirty = true;
  }

  /** screen rect of brick n under the current camera */
  rectOf(n: number): Rect {
    const s = slotOf(n);
    return this.worldRect(s.x - BRICK_W / 2, s.y - BRICK_H / 2, BRICK_W, BRICK_H);
  }

  // ── camera ─────────────────────────────────────────────────────────────────
  private clampS(s: number) {
    return Math.max(this.fitCam.s * 0.55, Math.min(4, s));
  }

  private computeFit() {
    const b = bounds(this.bricks.length);
    const inset = this.opts.inset ?? { top: 0, bottom: 0 };
    const padX = this.opts.compact ? 8 : Math.max(16, this.W * 0.04);
    const top = (this.opts.compact ? 6 : Math.max(36, this.H * 0.1)) + inset.top;
    const bottom = (this.opts.compact ? 6 : Math.max(28, this.H * 0.07)) + inset.bottom;
    // include the ghost slot for the next brick in the frame
    const maxY = Math.max(b.maxY, slotOf(this.bricks.length + 1).y + BRICK_H / 2);
    const bw = b.maxX - b.minX + (this.bricks.length < 3 ? BRICK_W * 2 : 0);
    const bh = maxY - b.minY;
    const s = Math.min((this.W - padX * 2) / bw, (this.H - top - bottom) / bh, this.opts.compact ? 2 : 1.35);
    const cy = (b.minY + maxY) / 2 + (bottom - top) / 2 / s;
    this.fitCam = { x: 0, y: cy, s: Math.max(0.02, s) };
  }

  private worldRect(x: number, y: number, w: number, h: number): Rect {
    const { cam } = this;
    return { x: (x - cam.x) * cam.s + this.W / 2, y: (y - cam.y) * cam.s + this.H / 2, w: w * cam.s, h: h * cam.s };
  }

  private toWorld(sx: number, sy: number) {
    return { x: this.cam.x + (sx - this.W / 2) / this.cam.s, y: this.cam.y + (sy - this.H / 2) / this.cam.s };
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = r.width;
    this.H = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    const first = this.fitCam.s === 1 && this.cam.s === 1;
    this.computeFit();
    if (this.autoFit || first) {
      this.target = { ...this.fitCam };
      if (first) this.cam = { ...this.fitCam };
    }
    if (!this.opts.compact) this.makeAmbient();
    this.dirty = true;
  }

  private makeAmbient() {
    // stars: cached layer
    const c = document.createElement('canvas');
    c.width = Math.round(this.W * this.dpr);
    c.height = Math.round(this.H * this.dpr);
    const x = c.getContext('2d')!;
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = Math.round((this.W * this.H) / 5200);
    for (let i = 0; i < n; i++) {
      const sy = Math.pow(r(), 1.7) * this.H * 0.85;
      x.fillStyle = `rgba(${r() > 0.85 ? '255,226,180' : '220,225,255'},${0.15 + r() * 0.55 * (1 - sy / this.H)})`;
      const d = (r() < 0.06 ? 1.6 : 0.5 + r() * 0.8) * this.dpr;
      x.beginPath();
      x.arc(r() * c.width, sy * this.dpr, d, 0, Math.PI * 2);
      x.fill();
    }
    this.stars = c;
    const count = this.opts.reducedMotion ? 0 : this.W < 640 ? 28 : 64;
    this.motes = Array.from({ length: count }, () => ({
      x: Math.random() * this.W,
      y: this.H * (0.35 + Math.random() * 0.65),
      r: 0.5 + Math.random() * 1.4,
      a: 0.12 + Math.random() * 0.35,
      v: 4 + Math.random() * 12,
      ph: Math.random() * Math.PI * 2,
    }));
  }

  // ── input ──────────────────────────────────────────────────────────────────
  private unbind?: () => void;

  private setZoomed() {
    const z = this.target.s > this.fitCam.s * 1.08;
    if (z !== this.zoomedIn) {
      this.zoomedIn = z;
      this.canvas.style.touchAction = z ? 'none' : 'pan-y';
      this.opts.onZoomed?.(z);
    }
  }

  private pick(sx: number, sy: number): Pick | null {
    const w = this.toWorld(sx, sy);
    const cap = capstone();
    if (Math.abs(w.x - cap.x) < cap.w / 2 && Math.abs(w.y - cap.y) < cap.h / 2) {
      return { kind: 'cap', rect: this.worldRect(cap.x - cap.w / 2, cap.y - cap.h / 2, cap.w, cap.h) };
    }
    const n = hitTest(w.x, w.y, this.bricks.length);
    return n ? { kind: 'brick', n, rect: this.rectOf(n) } : null;
  }

  private bindInput() {
    const c = this.canvas;
    c.style.touchAction = 'pan-y';
    const pos = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const down = (e: PointerEvent) => {
      const p = pos(e);
      this.pointers.set(e.pointerId, { ...p, t: performance.now(), x0: p.x, y0: p.y });
      this.vel = { x: 0, y: 0 };
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const mid = this.toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: this.target.s, wx: mid.x, wy: mid.y };
        this.drag = null;
        c.setPointerCapture(e.pointerId);
      } else if (e.pointerType === 'mouse' || this.zoomedIn) {
        this.drag = { x: p.x, y: p.y, cx: this.target.x, cy: this.target.y };
        if (e.pointerType === 'mouse') c.setPointerCapture(e.pointerId);
      }
    };

    const move = (e: PointerEvent) => {
      const p = pos(e);
      const ptr = this.pointers.get(e.pointerId);
      if (!ptr) {
        if (e.pointerType === 'mouse') this.setHover(this.pick(p.x, p.y));
        return;
      }
      const dt = Math.max(1, performance.now() - ptr.t);
      if (this.pinch && this.pointers.size === 2) {
        ptr.x = p.x;
        ptr.y = p.y;
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const ns = this.clampS((this.pinch.s * d) / this.pinch.d);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        this.autoFit = false;
        this.target = { s: ns, x: this.pinch.wx - (mx - this.W / 2) / ns, y: this.pinch.wy - (my - this.H / 2) / ns };
        this.cam = { ...this.target };
        this.dirty = true;
        return;
      }
      if (this.drag) {
        const moved = Math.hypot(p.x - ptr.x0, p.y - ptr.y0);
        if (moved > 4) {
          this.autoFit = false;
          this.vel = { x: ((p.x - ptr.x) / dt) * 16, y: ((p.y - ptr.y) / dt) * 16 };
          this.target = { ...this.target, x: this.drag.cx - (p.x - this.drag.x) / this.target.s, y: this.drag.cy - (p.y - this.drag.y) / this.target.s };
          this.cam = { ...this.target };
          this.setHover(null);
          c.style.cursor = 'grabbing';
          this.dirty = true;
        }
      }
      ptr.x = p.x;
      ptr.y = p.y;
      ptr.t = performance.now();
    };

    const up = (e: PointerEvent) => {
      const p = pos(e);
      const ptr = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      c.style.cursor = '';
      if (this.pointers.size < 2) this.pinch = null;
      if (!ptr) return;
      const tap = Math.hypot(p.x - ptr.x0, p.y - ptr.y0) < 8;
      if (this.drag && !tap && !this.opts.reducedMotion) {
        // inertia
        this.target = { ...this.target, x: this.target.x - (this.vel.x * 10) / this.target.s, y: this.target.y - (this.vel.y * 10) / this.target.s };
      }
      this.drag = null;
      if (tap && e.type === 'pointerup') {
        const now = performance.now();
        if (now - this.lastTap < 300 && e.pointerType !== 'mouse') {
          this.zoomBy(2, p.x, p.y);
          this.lastTap = 0;
          return;
        }
        this.lastTap = now;
        const hit = this.pick(p.x, p.y);
        this.opts.onSelect?.(hit);
        if (e.pointerType === 'mouse') this.setHover(hit);
      }
    };

    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) {
        this.opts.onHint?.(navigator.platform.includes('Mac') ? 'hold ⌘ and scroll to zoom' : 'hold ctrl and scroll to zoom');
        return;
      }
      e.preventDefault();
      const p = pos(e);
      this.zoomBy(Math.exp(-e.deltaY * 0.0022), p.x, p.y);
    };

    const dbl = (e: MouseEvent) => {
      const p = pos(e);
      this.zoomBy(2, p.x, p.y);
    };

    const leave = () => this.setHover(null);

    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', leave);
    c.addEventListener('wheel', wheel, { passive: false });
    c.addEventListener('dblclick', dbl);
    this.unbind = () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('pointerleave', leave);
      c.removeEventListener('wheel', wheel);
      c.removeEventListener('dblclick', dbl);
    };
  }

  private setHover(p: Pick | null) {
    const same = p?.kind === this.hover?.kind && (p?.kind !== 'brick' || (this.hover?.kind === 'brick' && this.hover.n === p.n));
    this.hover = p;
    this.canvas.style.cursor = p ? 'pointer' : '';
    if (!same || p) this.opts.onHover?.(p);
    if (!same) this.dirty = true;
  }

  // ── frame ──────────────────────────────────────────────────────────────────
  private frame = (t: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(64, this.last ? t - this.last : 16);
    this.last = t;
    // camera easing
    const k = 1 - Math.exp(-dt / (this.opts.reducedMotion ? 1 : 110));
    const c = this.cam;
    const tg = this.target;
    const moving = Math.abs(c.x - tg.x) * c.s > 0.3 || Math.abs(c.y - tg.y) * c.s > 0.3 || Math.abs(c.s - tg.s) / tg.s > 0.001;
    if (moving) {
      // zoom in log space so it feels even
      c.s = Math.exp(Math.log(c.s) + (Math.log(tg.s) - Math.log(c.s)) * k);
      c.x += (tg.x - c.x) * k;
      c.y += (tg.y - c.y) * k;
      this.setZoomed();
      if (this.hover) this.opts.onHover?.(this.hover.kind === 'brick' ? { ...this.hover, rect: this.rectOf(this.hover.n) } : this.pick(this.hover.rect.x + this.hover.rect.w / 2, this.hover.rect.y + this.hover.rect.h / 2));
    } else if (c !== tg) {
      this.cam = { ...tg };
    }
    const ambient = !this.opts.reducedMotion && !this.opts.compact;
    const animating = this.drops.size > 0 || this.dust.length > 0 || (this.highlight && this.highlight.until > t);
    if (!this.dirty && !moving && !ambient && !animating) return;
    this.dirty = false;
    this.draw(t, dt);
  };

  private draw(t: number, dt: number) {
    const { ctx: x, dpr, W, H } = this;
    const cam = this.cam;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);

    let shakeX = 0;
    let shakeY = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt / 280);
      shakeX = (Math.random() - 0.5) * 5 * this.shake;
      shakeY = (Math.random() - 0.5) * 4 * this.shake;
    }

    const cap = capstone();
    const capS = { x: (cap.x - cam.x) * cam.s + W / 2 + shakeX, y: (cap.y - cam.y) * cam.s + H / 2 + shakeY };

    if (!this.opts.compact) {
      if (this.stars) x.drawImage(this.stars, 0, 0, W, H);
      this.drawLight(x, capS, t);
    }

    // world transform
    const S = cam.s;
    x.setTransform(dpr * S, 0, 0, dpr * S, dpr * (W / 2 - cam.x * S + shakeX), dpr * (H / 2 - cam.y * S + shakeY));
    const wx0 = cam.x - W / 2 / S;
    const wx1 = cam.x + W / 2 / S;
    const wy0 = cam.y - H / 2 / S;
    const wy1 = cam.y + H / 2 / S;

    const count = this.bricks.length;
    const rows = count ? rowOf(count) + 1 : 0;
    const groundY = count ? (rows - 1) * PITCH_Y + BRICK_H / 2 + GAP / 2 : BRICK_H / 2 + GAP / 2;
    if (!this.opts.compact) this.drawGround(x, groundY, wx0, wx1, wy1, rows);

    const r0 = Math.max(0, Math.floor(wy0 / PITCH_Y) - 1);
    const r1 = Math.min(rows - 1, Math.ceil(wy1 / PITCH_Y) + 1);
    const bh = BRICK_H * S; // on-screen brick height
    const detail = bh >= 15 && !this.opts.compact;
    const text = bh >= 25 && !this.opts.compact;
    const now = Date.now();

    const visible: number[] = [];
    for (let r = r0; r <= r1; r++) {
      const inv = posIndex(r + 1);
      const c0 = Math.max(0, Math.floor(wx0 / PITCH_X + r / 2) - 1);
      const c1 = Math.min(r, Math.ceil(wx1 / PITCH_X + r / 2) + 1);
      const base = rowStart(r);
      for (let col = c0; col <= c1; col++) {
        const n = base + inv[col];
        if (n <= count) visible.push(n);
      }
    }

    // glow pass (additive)
    x.globalCompositeOperation = 'lighter';
    const gs = glowSprite();
    for (const n of visible) {
      const b = this.bricks[n - 1];
      if (b.hidden || this.drops.has(n)) continue;
      const g = glowOf(b.mcap);
      if (g <= 0.05 || crackLevel(b.belowSince, now)) continue;
      const s = slotOf(n);
      const pulse = this.opts.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t / 900 + n);
      x.globalAlpha = Math.min(1, g * 0.9) * pulse;
      const gw = BRICK_W * (1.4 + g * 1.1);
      const gh = BRICK_H * (2 + g * 1.6);
      x.drawImage(gs, s.x - gw / 2, s.y - gh / 2, gw, gh);
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';

    // bricks
    for (const n of visible) {
      if (this.drops.has(n)) continue;
      this.drawBrick(x, n, 0, 0, detail, text, now, S);
    }

    // ghost slot for the next brick
    if (!this.opts.compact) {
      const nx = slotOf(count + 1);
      const a = this.opts.reducedMotion ? 0.5 : 0.35 + 0.25 * Math.sin(t / 600);
      x.save();
      x.setLineDash([6, 5]);
      x.lineDashOffset = -t / 60;
      x.strokeStyle = `rgba(255,181,46,${a})`;
      x.lineWidth = Math.max(1, 1.2 / S);
      x.strokeRect(nx.x - BRICK_W / 2 + 1, nx.y - BRICK_H / 2 + 1, BRICK_W - 2, BRICK_H - 2);
      x.restore();
      if (text) {
        x.fillStyle = `rgba(255,200,110,${a + 0.2})`;
        x.font = '500 9px "JetBrains Mono", monospace';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(`#${count + 1} · your brick?`, nx.x, nx.y);
      }
    }

    // capstone
    const capHover = this.hover?.kind === 'cap';
    drawCapstone(x, cap.x, cap.y, cap.w, cap.h, this.opts.reducedMotion ? 1200 : t, capHover);

    // falling bricks on top
    for (const [n, d] of this.drops) {
      const el = performance.now() - d.t0;
      const s = slotOf(n);
      if (this.opts.reducedMotion) {
        x.globalAlpha = Math.min(1, el / 350);
        this.drawBrick(x, n, 0, 0, detail, text, now, S);
        x.globalAlpha = 1;
        if (el > 400) this.drops.delete(n);
        continue;
      }
      let off = 0;
      let rot = 0;
      if (el < DROP_FALL) {
        const p = el / DROP_FALL;
        off = d.fromY * (1 - p * p); // accelerating fall
        rot = (1 - p) * 0.06 * (n % 2 ? 1 : -1);
        x.globalAlpha = Math.min(1, 0.3 + p * 2);
      } else {
        if (!d.impacted) {
          d.impacted = true;
          this.impact(s.x, s.y + BRICK_H / 2);
        }
        const p = (el - DROP_FALL) / (DROP_TOTAL - DROP_FALL);
        off = -Math.abs(Math.sin(p * Math.PI * 2)) * 9 * Math.pow(1 - p, 2.2); // two small, heavy bounces
      }
      // shadow on landing spot
      x.fillStyle = `rgba(0,0,0,${0.25 * Math.max(0, 1 + off / 300)})`;
      x.fillRect(s.x - BRICK_W / 2 + 4, s.y + BRICK_H / 2 - 3, BRICK_W - 8, 4);
      x.save();
      x.translate(s.x, s.y + off);
      x.rotate(rot);
      x.translate(-s.x, -s.y);
      this.drawBrick(x, n, 0, 0, detail, text, now, S);
      x.restore();
      x.globalAlpha = 1;
      if (el > DROP_TOTAL) this.drops.delete(n);
    }

    // highlight + hover outlines
    const hl = this.highlight && this.highlight.until > t ? this.highlight.n : null;
    if (hl && hl <= count) {
      const s = slotOf(hl);
      const a = 0.55 + 0.45 * Math.sin(t / 220);
      x.strokeStyle = `rgba(255,211,110,${a})`;
      x.lineWidth = Math.max(1.5, 2.5 / S);
      x.strokeRect(s.x - BRICK_W / 2 - 3, s.y - BRICK_H / 2 - 3, BRICK_W + 6, BRICK_H + 6);
    }
    if (this.hover?.kind === 'brick' && this.hover.n <= count) {
      const s = slotOf(this.hover.n);
      x.strokeStyle = '#ffd36e';
      x.lineWidth = Math.max(1.2, 2 / S);
      x.shadowColor = 'rgba(255,181,46,0.8)';
      x.shadowBlur = 14;
      x.strokeRect(s.x - BRICK_W / 2 - 1, s.y - BRICK_H / 2 - 1, BRICK_W + 2, BRICK_H + 2);
      x.shadowBlur = 0;
    }

    // dust
    if (this.dust.length) {
      for (const p of this.dust) {
        p.age += dt;
        p.vx *= 0.96;
        p.vy = p.vy * 0.96 + 0.012 * dt;
        p.x += (p.vx * dt) / 16;
        p.y += (p.vy * dt) / 16;
        const life = 1 - p.age / p.life;
        if (life <= 0) continue;
        x.fillStyle = `rgba(226,196,146,${0.55 * life})`;
        x.beginPath();
        x.arc(p.x, p.y, p.r * (1.4 - life * 0.4), 0, Math.PI * 2);
        x.fill();
      }
      this.dust = this.dust.filter((p) => p.age < p.life);
    }

    // screen-space motes
    if (this.motes.length) {
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const m of this.motes) {
        m.x += (m.v * dt) / 1000;
        m.y += Math.sin(t / 1700 + m.ph) * 0.06;
        if (m.x > W + 4) m.x = -4;
        x.fillStyle = `rgba(255,214,160,${m.a * (0.6 + 0.4 * Math.sin(t / 900 + m.ph))})`;
        x.beginPath();
        x.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        x.fill();
      }
    }
  }

  private impact(wx: number, wy: number) {
    this.shake = 1;
    const n = this.W < 640 ? 18 : 30;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      this.dust.push({
        x: wx + side * (BRICK_W / 2 - Math.random() * 20),
        y: wy - Math.random() * 4,
        vx: side * (0.6 + Math.random() * 2.6),
        vy: -(0.4 + Math.random() * 1.6),
        r: 1.5 + Math.random() * 3.5,
        life: 700 + Math.random() * 700,
        age: 0,
      });
    }
  }

  private drawBrick(x: CanvasRenderingContext2D, n: number, dx: number, dy: number, detail: boolean, text: boolean, now: number, S: number) {
    const b = this.bricks[n - 1];
    const s = slotOf(n);
    const L = s.x - BRICK_W / 2 + dx;
    const T = s.y - BRICK_H / 2 + dy;
    const crack = b.hidden ? 0 : crackLevel(b.belowSince, now);
    const variant = hash(b.mint) % VARIANTS;
    if (BRICK_H * S < 3) {
      // far away: a flat tile is indistinguishable and cheaper
      x.fillStyle = b.hidden ? '#5c4a30' : crack ? '#5d5144' : tierOf(b.mcap) > 2 ? '#e8b445' : '#b48c55';
      x.fillRect(L, T, BRICK_W, BRICK_H);
      return;
    }
    x.drawImage(brickSprite(tierOf(b.mcap), crack, variant, b.hidden), L, T, BRICK_W, BRICK_H);
    if (!detail) return;
    if (b.hidden) {
      if (text) {
        x.fillStyle = 'rgba(30,18,6,0.55)';
        x.font = '600 9px "JetBrains Mono", monospace';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText('SEALED', s.x + dx, s.y + dy);
      }
      return;
    }
    const pad = 6;
    const im = BRICK_H - pad * 2;
    const img = b.image ? this.images.get(b.image) : null;
    const art = img ?? sigil(b.mint, b.ticker);
    if (crack) x.globalAlpha *= 0.55;
    x.drawImage(art, L + pad, T + pad, im, im);
    if (crack) x.globalAlpha /= 0.55;
    x.strokeStyle = 'rgba(40,22,6,0.55)';
    x.lineWidth = 1;
    x.strokeRect(L + pad + 0.5, T + pad + 0.5, im - 1, im - 1);
    if (!text) return;
    const tx = L + pad + im + 7;
    const maxW = BRICK_W - (tx - L) - 6;
    const dark = crack ? 'rgba(20,14,8,0.75)' : '#2a1806';
    // ticker: shrink to fit
    const tk = b.ticker;
    let w = tickerWidth.get(tk);
    if (w === undefined) {
      x.font = '700 14px "Hanken Grotesk", sans-serif';
      w = x.measureText(tk).width;
      tickerWidth.set(tk, w);
    }
    const fs = Math.min(14, (14 * maxW) / Math.max(1, w));
    x.font = `700 ${fs.toFixed(1)}px "Hanken Grotesk", sans-serif`;
    x.textAlign = 'left';
    x.textBaseline = 'alphabetic';
    x.fillStyle = dark;
    x.fillText(tk, tx, T + 22);
    x.font = '500 10px "JetBrains Mono", monospace';
    x.fillStyle = crack ? 'rgba(20,14,8,0.6)' : 'rgba(42,24,6,0.78)';
    x.fillText(crack ? 'cracked' : usdShort(b.mcap), tx, T + 37);
    if (S > 1.4) {
      x.font = '500 7px "JetBrains Mono", monospace';
      x.fillStyle = 'rgba(42,24,6,0.55)';
      x.textAlign = 'right';
      x.fillText(`#${n}`, L + BRICK_W - 5, T + BRICK_H - 7);
    }
  }

  private drawGround(x: CanvasRenderingContext2D, gy: number, wx0: number, wx1: number, wy1: number, rows: number) {
    if (gy > wy1 + 10) return;
    const half = Math.max(rows, 1) * PITCH_X * 0.5;
    // contact shadow + lit sand under the pyramid
    const g = x.createLinearGradient(0, gy, 0, gy + PITCH_Y * 6);
    g.addColorStop(0, 'rgba(120,88,48,0.55)');
    g.addColorStop(0.15, 'rgba(70,50,30,0.35)');
    g.addColorStop(1, 'rgba(10,10,20,0)');
    x.fillStyle = g;
    x.fillRect(wx0, gy, wx1 - wx0, PITCH_Y * 6);
    const rg = x.createRadialGradient(0, gy, 0, 0, gy, half * 1.6 + 200);
    rg.addColorStop(0, 'rgba(255,190,90,0.20)');
    rg.addColorStop(1, 'rgba(255,190,90,0)');
    x.fillStyle = rg;
    x.fillRect(-half * 1.6 - 200, gy, (half * 1.6 + 200) * 2, half + 200);
    x.fillStyle = 'rgba(255,214,150,0.35)';
    x.fillRect(wx0, gy, wx1 - wx0, Math.max(0.6, 1 / this.cam.s));
  }

  private drawLight(x: CanvasRenderingContext2D, c: { x: number; y: number }, t: number) {
    const { W, H } = this;
    const R = Math.max(W, H) * 1.3;
    x.save();
    x.globalCompositeOperation = 'lighter';
    // halo
    const halo = x.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(W, H) * 0.55);
    halo.addColorStop(0, 'rgba(255,190,80,0.30)');
    halo.addColorStop(0.25, 'rgba(255,160,50,0.08)');
    halo.addColorStop(1, 'rgba(255,150,40,0)');
    x.fillStyle = halo;
    x.fillRect(0, 0, W, H);
    // volumetric rays
    const motion = this.opts.reducedMotion ? 0 : t;
    const rays = 9;
    for (let i = 0; i < rays; i++) {
      const base = -Math.PI / 2 + (i - (rays - 1) / 2) * 0.27;
      const a = base + Math.sin(motion / 5200 + i * 1.7) * 0.035;
      const wdt = 0.035 + ((i * 37) % 7) * 0.008;
      const g = x.createRadialGradient(c.x, c.y, 0, c.x, c.y, R);
      const alpha = 0.05 + 0.03 * Math.sin(motion / 2400 + i * 2.1);
      g.addColorStop(0, `rgba(255,200,110,${alpha * 2})`);
      g.addColorStop(0.5, `rgba(255,190,100,${alpha * 0.6})`);
      g.addColorStop(1, 'rgba(255,190,100,0)');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(c.x, c.y);
      x.lineTo(c.x + Math.cos(a - wdt) * R, c.y + Math.sin(a - wdt) * R);
      x.lineTo(c.x + Math.cos(a + wdt) * R, c.y + Math.sin(a + wdt) * R);
      x.closePath();
      x.fill();
    }
    x.restore();
  }
}

export function usdShort(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`;
  return `$${Math.round(n)}`;
}
