export function normalizeLimit(value: unknown, fallback = 20): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(100, Math.max(1, Math.trunc(parsed)));
}