/** nemis-YYYY-MM-DDTHH-mm-ss-SSS[-label].db — UTC, millisecond precision, lexicographically sortable. */
export function buildBackupFileName(date: Date, label?: string): string {
  const stamp = date.toISOString().slice(0, 23).replaceAll(':', '-').replace('.', '-');
  const sanitized = label
    ? label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    : '';
  const suffix = sanitized ? `-${sanitized}` : '';
  return `nemis-${stamp}${suffix}.db`;
}
