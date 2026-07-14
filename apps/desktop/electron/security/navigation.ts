/**
 * Pure origin check for navigation guarding.
 *
 * Comparison is by URL components, not string prefixes or URL.origin:
 * prefix matching is bypassable (e.g. `http://localhost:3010@evil.com/`
 * parses the allowed host as userinfo), and Node's URL.origin returns
 * 'null' for custom schemes like app://, which would treat every
 * custom-scheme URL as same-origin.
 */
export function isAllowedNavigation(url: string, allowedOrigins: readonly string[]): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  return allowedOrigins.some((allowed) => {
    const origin = new URL(allowed);
    return target.protocol === origin.protocol && target.host === origin.host;
  });
}
