/** portal-web's create form: county code plus the last 4 EMIS characters, or
 * the last 6 digits of the clock when there is no EMIS code. */
export function formSchoolCode(countyCode: string | null, emisCode: string | undefined, nowIso: string): string {
  return `${countyCode || 'XX'}-${(emisCode ?? '').slice(-4) || String(Date.parse(nowIso)).slice(-6)}`;
}

/** portal-web's bulk import: county code plus 5 random base-36 characters. */
export function randomSchoolCode(countyCode: string | null, random: () => number): string {
  return `${countyCode ?? 'XX'}-${random().toString(36).slice(2, 7).toUpperCase()}`;
}
