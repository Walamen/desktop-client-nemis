import type { WebContents } from 'electron';
import { logger } from '@app/services/logger';

/**
 * Locks a WebContents down to the application's own origins:
 * denies every new-window request and blocks navigation to
 * any URL whose protocol + host do not match an allowed origin.
 *
 * Comparison is by URL components, not string prefixes or URL.origin:
 * prefix matching is bypassable (e.g. `http://localhost:3010@evil.com/`
 * parses the allowed host as userinfo), and Node's URL.origin returns
 * 'null' for custom schemes like app://, which would treat every
 * custom-scheme URL as same-origin.
 */
export function hardenWebContents(contents: WebContents, allowedOrigins: readonly string[]): void {
  contents.setWindowOpenHandler(({ url }) => {
    logger.warn(`Blocked attempt to open a new window: ${url}`);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, allowedOrigins)) {
      logger.warn(`Blocked navigation to: ${url}`);
      event.preventDefault();
    }
  });
}

function isAllowedNavigation(url: string, allowedOrigins: readonly string[]): boolean {
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
