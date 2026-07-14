import type { WebContents } from 'electron';
import { isAllowedNavigation } from '@app/security/navigation';
import { logger } from '@app/services/logger';

/**
 * Locks a WebContents down to the application's own origins:
 * denies every new-window request and blocks navigation to
 * any URL whose protocol + host do not match an allowed origin.
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
