/**
 * Codec for the opaque `sessionSecret` string persisted by SessionRepository.
 * Both the authentication and provisioning gateways speak this format; kept
 * in one place so the encoding can't drift between them.
 */
export function wrapCookies(cookies: string): string {
  return JSON.stringify({ cookies });
}

export function unwrapCookies(secret: string): string {
  const parsed = asRecord(JSON.parse(secret));
  if (typeof parsed.cookies !== 'string' || parsed.cookies.length === 0) {
    throw new Error('The protected session is invalid.');
  }
  return parsed.cookies;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
