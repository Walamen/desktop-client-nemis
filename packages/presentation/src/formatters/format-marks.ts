export function formatMarks(obtained: number, total: number): string {
  return `${obtained} / ${total}`;
}

export function formatPercent(obtained: number, total: number): string {
  return total > 0 ? `${Math.round((obtained / total) * 100)}%` : '—';
}
