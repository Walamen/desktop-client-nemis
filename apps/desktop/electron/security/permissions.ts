import { session } from 'electron';
import { logger } from '@app/services/logger';

/**
 * Phase 1 needs no browser permissions (media, geolocation, notifications, …).
 * Deny everything by default; future features must opt in explicitly here.
 */
export function denyPermissionRequests(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    logger.warn(`Denied permission request: ${permission}`);
    callback(false);
  });
}
