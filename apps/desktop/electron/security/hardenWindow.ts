import type { WebContents } from 'electron';
import { logger } from '@app/services/logger';

/**
 * Locks a WebContents down to the application's own origins:
 * denies every new-window request and blocks navigation to
 * any URL that does not start with an allowed prefix.
 */
export function hardenWebContents(
  contents: WebContents,
  allowedUrlPrefixes: readonly string[],
): void {
  contents.setWindowOpenHandler(({ url }) => {
    logger.warn(`Blocked attempt to open a new window: ${url}`);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    const allowed = allowedUrlPrefixes.some((prefix) => url.startsWith(prefix));
    if (!allowed) {
      logger.warn(`Blocked navigation to: ${url}`);
      event.preventDefault();
    }
  });
}
