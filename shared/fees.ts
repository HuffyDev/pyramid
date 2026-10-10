/**
 * Cost estimates shown before signing. pump.fun's fees change over time, so
 * every line that is not exact is flagged `estimate: true` and the UI says so.
 */
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const BASE_FEE_PER_SIG_SOL = 0.000005;
/** create tx is signed by the creator wallet and the fresh mint keypair */
export const CREATE_TX_SIGNATURES = 2;
/** pump.fun bonding-curve trade fee applied to the dev buy (approx.) */
export const PUMP_TRADE_FEE_BPS = 125;
/** rent for mint, metadata, bonding curve and token accounts (approx.) */
export const CREATE_RENT_SOL = 0.0225;

export interface CostLine {
  label: string;
  sol: number;
  estimate: boolean;
  hint?: string;
}

export function estimateCost(input: { devBuySol: number; priorityFeeSol: number }) {
  const devBuy = Math.max(0, input.devBuySol || 0);
  const lines: CostLine[] = [
    { label: 'Dev buy', sol: devBuy, estimate: false, hint: 'SOL spent buying your own coin at launch' },
    {
      label: 'pump.fun trade fee',
      sol: (devBuy * PUMP_TRADE_FEE_BPS) / 10_000,
      estimate: true,
      hint: `~${PUMP_TRADE_FEE_BPS / 100}% of the dev buy`,
    },
    { label: 'Account rent', sol: CREATE_RENT_SOL, estimate: true, hint: 'mint, metadata and curve accounts' },
    {
      label: 'Network fee',
      sol: BASE_FEE_PER_SIG_SOL * CREATE_TX_SIGNATURES,
      estimate: false,
      hint: `${CREATE_TX_SIGNATURES} signatures`,
    },
    { label: 'Priority fee', sol: Math.max(0, input.priorityFeeSol || 0), estimate: false },
  ];
  const total = lines.reduce((s, l) => s + l.sol, 0);
  return { lines, total, platformFee: 0 };
}

export function formatSol(n: number, maxDp = 6): string {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  const dp = n >= 1 ? 3 : maxDp;
  return n.toFixed(dp).replace(/\.?0+$/, '');
}
