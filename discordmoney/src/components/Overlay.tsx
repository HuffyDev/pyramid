import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { cx } from './ui';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let openCount = 0;

function useDialogBehaviour(open: boolean, onClose: () => void, panel: RefObject<HTMLDivElement>, locked: boolean, initialFocus?: RefObject<HTMLElement>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    openCount++;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      const target = initialFocus?.current ?? panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? panel.current)?.focus();
    }, 20);
    const onKey = (e: KeyboardEvent) => {
      if (!panel.current) return;
      // only the top-most dialog reacts
      const dialogs = document.querySelectorAll('[data-dialog]');
      if (dialogs[dialogs.length - 1] !== panel.current) return;
      if (e.key === 'Escape') {
        if (lockedRef.current) return;
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab') {
        const els = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      openCount--;
      if (openCount <= 0) document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [open, panel, initialFocus]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  locked = false,
  initialFocus,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  locked?: boolean;
  initialFocus?: RefObject<HTMLElement>;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useDialogBehaviour(open, onClose, panel, locked, initialFocus);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/70" onClick={() => !locked && onClose()} aria-hidden="true" />
      <div
        ref={panel}
        data-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={description ? `${id}-d` : undefined}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[92vh] w-full animate-pop-in flex-col overflow-hidden rounded-t-xl bg-page shadow-pop outline-none sm:rounded-xl',
          size === 'sm' ? 'sm:max-w-[440px]' : size === 'md' ? 'sm:max-w-[520px]' : 'sm:max-w-[680px]',
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h2 id={`${id}-t`} className="text-xl font-bold tracking-tight text-ink">
              {title}
            </h2>
            {description && (
              <p id={`${id}-d`} className="mt-1 text-sm text-ink-mute">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            className="-mr-1 -mt-1 rounded-md p-1.5 text-ink-mute transition-colors hover:bg-hover hover:text-ink disabled:opacity-30"
            aria-label="Close dialog"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 bg-card px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useDialogBehaviour(open, onClose, panel, false);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        data-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-[480px] animate-slide-in flex-col border-l border-black/40 bg-page shadow-pop outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/30 bg-card px-5 py-4">
          <div className="min-w-0">
            <h2 id={`${id}-t`} className="truncate text-lg font-bold text-ink">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-[13px] text-ink-mute">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink-mute hover:bg-hover hover:text-ink" aria-label="Close panel">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-black/30 bg-card px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  tone = 'primary',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            data-autofocus
            className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-ink-body">{body}</div>
    </Modal>
  );
}
