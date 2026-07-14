import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { withCsp } from '@app/security/csp';
import { logger } from '@app/services/logger';

export const APP_SCHEME = 'app';

/** Must be called before app.whenReady(). */
export function registerAppProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

/**
 * Serves the Next.js static export (shipped via extraResource to
 * <resources>/out) on app://renderer/. trailingSlash exports mean every
 * route maps to <route>/index.html.
 */
export function registerAppProtocolHandler(): void {
  const rendererRoot = path.join(process.resourcesPath, 'out');

  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    let relativePath = decodeURIComponent(pathname);
    if (relativePath.endsWith('/')) {
      relativePath += 'index.html';
    }

    const filePath = path.normalize(path.join(rendererRoot, relativePath));
    if (filePath !== rendererRoot && !filePath.startsWith(rendererRoot + path.sep)) {
      logger.warn(`Blocked app:// request outside renderer root: ${request.url}`);
      return withCsp(new Response('Forbidden', { status: 403 }));
    }

    try {
      const response = await net.fetch(pathToFileURL(filePath).toString());
      return withCsp(response);
    } catch (error) {
      logger.warn(`app:// asset not found: ${request.url}`, error);
      return withCsp(new Response('Not Found', { status: 404 }));
    }
  });
}
