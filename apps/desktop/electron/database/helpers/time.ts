/** Canonical timestamp format for every createdAt/updatedAt: ISO-8601 UTC. */
export function nowIso(): string {
  return new Date().toISOString();
}
