import { formatUnits, parseUnits } from 'viem';

export { formatUnits, parseUnits };

/** 1234567 -> "1.23M", 0.00001234 -> "0.00001234" */
export function compact(n: number | undefined, digits = 2): string {
  if (n === undefined || !Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(digits)}K`;
  if (abs >= 1) return n.toFixed(digits);
  if (abs === 0) return '0';
  return n.toPrecision(3);
}

export const usd = (n: number | undefined) => (n === undefined ? '-' : `$${compact(n)}`);

export function price(n: number | undefined): string {
  if (n === undefined) return '-';
  if (n >= 1) return `$${n.toFixed(4)}`;
  // Memecoin prices are often 0.0000xxx — show 4 significant digits.
  return `$${n.toPrecision(4)}`;
}

export function pct(n: number | undefined): string {
  if (n === undefined) return '-';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

export function age(ts: number | undefined): string {
  if (!ts) return '-';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Native number (e.g. 0.1) to a decimal string that's safe for parseUnits (avoids 1e-7). */
export function toDecimalString(n: number): string {
  return n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 18 });
}
