import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useLockBody } from '../lib/hooks';

interface Props {
  file: File;
  aspect: number; // width / height
  outWidth: number;
  title: string;
  onCancel: () => void;
  onDone: (blob: Blob, url: string) => void;
}

/** Drag to pan, slider / wheel / pinch to zoom. Outputs a canvas-rendered blob. */
export function ImageCropper({ file, aspect, outWidth, title, onCancel, onDone }: Props) {
  useLockBody(true);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const srcUrl = useRef<string>('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    srcUrl.current = url;
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // geometry in viewport px
  const geo = useCallback(() => {
    const el = box.current;
    if (!el || !img) return null;
    const vw = el.clientWidth;
    const vh = vw / aspect;
    const base = Math.max(vw / img.naturalWidth, vh / img.naturalHeight);
    const s = base * zoom;
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    return { vw, vh, s, w, h, maxX: (w - vw) / 2, maxY: (h - vh) / 2 };
  }, [img, zoom, aspect]);

  const clamp = useCallback(
    (o: { x: number; y: number }) => {
      const g = geo();
      if (!g) return o;
      return { x: Math.max(-g.maxX, Math.min(g.maxX, o.x)), y: Math.max(-g.maxY, Math.min(g.maxY, o.y)) };
    },
    [geo],
  );

  useEffect(() => setOff((o) => clamp(o)), [zoom, clamp]);

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom };
      drag.current = null;
    } else drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      setZoom(Math.min(4, Math.max(1, (pinch.current.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.d)));
    } else if (drag.current) {
      setOff(clamp({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current = null;
  };

  const export_ = async () => {
    const g = geo();
    if (!g || !img) return;
    setBusy(true);
    const outH = Math.round(outWidth / aspect);
    const c = document.createElement('canvas');
    c.width = outWidth;
    c.height = outH;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    // visible rect in source px
    const sx = (g.w / 2 - g.vw / 2 - off.x) / g.s;
    const sy = (g.h / 2 - g.vh / 2 - off.y) / g.s;
    ctx.drawImage(img, sx, sy, g.vw / g.s, g.vh / g.s, 0, 0, outWidth, outH);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    c.toBlob(
      (b) => {
        setBusy(false);
        if (b) onDone(b, URL.createObjectURL(b));
      },
      type,
      0.92,
    );
  };

  const g = geo();
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal aria-label={title}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-[520px] animate-rise rounded-t-2xl border border-sand-50/10 bg-night-850 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="eyebrow flex items-center gap-2">
              <Icon name="crop" size={12} /> crop · {aspect === 1 ? '1:1' : `${aspect}:1`}
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">{title}</h2>
          </div>
          <button className="btn-quiet -mr-2 p-2" onClick={onCancel} aria-label="Cancel">
            <Icon name="x" />
          </button>
        </div>
        <div
          ref={box}
          className="relative w-full touch-none select-none overflow-hidden rounded-xl border border-sand-50/10 bg-night-950"
          style={{ aspectRatio: String(aspect), cursor: 'grab' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onWheel={(e) => setZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.0015)))}
        >
          {img && g && (
            <img
              src={srcUrl.current}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{ width: g.w, height: g.h, transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))` }}
            />
          )}
          {/* thirds grid */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="border-[0.5px] border-white/10" />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-gold/40" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="font-mono text-[11px] text-sand-400">1×</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-night-600 accent-[#ffb52e]"
            aria-label="Zoom"
          />
          <span className="font-mono text-[11px] text-sand-400">4×</span>
        </div>
        <p className="mt-2 text-xs text-sand-400">Drag to reposition. Scroll or pinch to zoom.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-gold" onClick={export_} disabled={!img || busy}>
            <Icon name="check" /> Use image
          </button>
        </div>
      </div>
    </div>
  );
}
