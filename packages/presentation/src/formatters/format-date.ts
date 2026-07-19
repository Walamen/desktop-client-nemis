const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

export function formatIsoDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '—' : DATE.format(t);
}

export function formatIsoDateTime(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '—' : DATE_TIME.format(t);
}
