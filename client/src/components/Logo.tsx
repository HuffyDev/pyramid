/** Vector trace of the PYRAMID mark: outlined pyramid, half-filled chamber, two base slabs. */
export const LOGO_PATHS = (
  <>
    <path d="M627 290 320 810h614Z" fill="none" stroke="currentColor" strokeWidth="40" strokeLinejoin="round" />
    <path d="M627 338 362 783h524Z" fill="none" stroke="currentColor" strokeWidth="9" strokeLinejoin="miter" />
    <path d="M483 588h282l105 187H375Z" fill="currentColor" />
    <path d="M400 862h454l43 35H355Z" fill="currentColor" />
    <path d="M298 906h655l45 38v24H252v-24Z" fill="currentColor" />
  </>
);

export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="232 250 790 740" className={className} aria-hidden>
      {LOGO_PATHS}
    </svg>
  );
}
