export const short = (addr: string, n = 4) => (addr.length > n * 2 + 1 ? `${addr.slice(0, n)}…${addr.slice(-n)}` : addr);

export function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const links = {
  pump: (mint: string) => `https://pump.fun/coin/${mint}`,
  solscan: (mint: string) => `https://solscan.io/token/${mint}`,
  solscanTx: (sig: string) => `https://solscan.io/tx/${sig}`,
  dex: (mint: string) => `https://dexscreener.com/solana/${mint}`,
  dexEmbed: (mint: string) => `https://dexscreener.com/solana/${mint}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=15`,
  tweet: (text: string) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
};

export const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1)}%`);

export const clockString = (d = new Date()) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
