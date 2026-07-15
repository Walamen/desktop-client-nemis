/** nemis-YYYY-MM-DDTHH-mm-ss[-label].db — UTC, lexicographically sortable. */
export function buildBackupFileName(date: Date, label?: string): string {
  const stamp = date.toISOString().slice(0, 19).replaceAll(':', '-');
  const suffix = label
    ? `-${label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')}`
    : '';
  return `nemis-${stamp}${suffix}.db`;
}
