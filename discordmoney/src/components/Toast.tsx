import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

type Tone = 'success' | 'error' | 'info';
interface T {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}
interface Api {
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
}

const Ctx = createContext<Api | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const n = useRef(0);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone: Tone, title: string, body?: string) => {
      const id = ++n.current;
      setItems((xs) => [...xs.slice(-3), { id, tone, title, body }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 5200 : 3400);
    },
    [dismiss],
  );
  const api = useMemo<Api>(
    () => ({
      success: (t, b) => push('success', t, b),
      error: (t, b) => push('error', t, b),
      info: (t, b) => push('info', t, b),
    }),
    [push],
  );
  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:pr-6"
        aria-live="polite"
        role="status"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-lg border border-line bg-[#111214] px-3.5 py-3 shadow-pop"
          >
            <span
              className={
                'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ' +
                (t.tone === 'success' ? 'bg-mint text-white' : t.tone === 'error' ? 'bg-danger text-white' : 'bg-blurple text-white')
              }
            >
              <Icon name={t.tone === 'success' ? 'check' : t.tone === 'error' ? 'x' : 'info'} size={12} strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">{t.title}</div>
              {t.body && <div className="mt-0.5 break-words text-[12.5px] text-ink-mute">{t.body}</div>}
            </div>
            <button type="button" className="rounded p-0.5 text-ink-mute hover:text-ink" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast outside provider');
  return v;
}
