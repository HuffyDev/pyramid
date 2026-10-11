/** Original chat-bubble + coin emblem. Deliberately not Discord's mark. */
export function Emblem({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="dm-em" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6E79F6" />
          <stop offset="1" stopColor="#4752C4" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#dm-em)" />
      <path
        d="M9 8.5h14a3.5 3.5 0 0 1 3.5 3.5v7a3.5 3.5 0 0 1-3.5 3.5h-7.2l-4.6 3.6c-.5.4-1.2 0-1.2-.6v-3H9A3.5 3.5 0 0 1 5.5 19v-7A3.5 3.5 0 0 1 9 8.5Z"
        fill="#fff"
      />
      <circle cx="16" cy="15.5" r="4.7" fill="#5865F2" />
      <circle cx="16" cy="15.5" r="4.7" fill="none" stroke="#C9CDFB" strokeWidth=".8" strokeDasharray="1.2 1.1" />
      <path d="M16 12.8v5.4M14.3 14.1h2.6a1 1 0 0 1 0 2h-1.8a1 1 0 0 0 0 2h2.6" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Emblem size={compact ? 26 : 30} />
      <span className="text-[17px] font-extrabold tracking-[-0.02em] text-ink">
        Discord<span className="text-blurple-light">Money</span>
      </span>
    </span>
  );
}
