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

/**
 * Synchronous twin of the request handler: some APIs consult
 * checkPermission without firing a request event. Deny those too.
 */
export function denyPermissionChecks(): void {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    logger.warn(`Denied permission check: ${permission}`);
    return false;
  });
}
