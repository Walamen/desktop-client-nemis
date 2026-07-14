import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { withCsp } from '@app/security/csp';
import { logger } from '@app/services/logger';
import { resolveRendererPath } from '@app/main/rendererPath';

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
    const filePath = resolveRendererPath(rendererRoot, new URL(request.url).pathname);
    if (filePath === null) {
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
