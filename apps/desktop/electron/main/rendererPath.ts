import path from 'node:path';

/**
 * Maps an app:// URL pathname onto a file inside the renderer root.
 * Returns null when the resolved path escapes the root (path traversal).
 * trailingSlash exports mean every route directory maps to index.html.
 */
export function resolveRendererPath(rendererRoot: string, pathname: string): string | null {
  let relativePath: string;
  try {
    relativePath = decodeURIComponent(pathname);
  } catch {
    // Malformed percent-encoding (e.g. /%zz) — reject instead of throwing
    // out of the protocol handler.
    return null;
  }
  if (relativePath.endsWith('/')) {
    relativePath += 'index.html';
  }
  const filePath = path.normalize(path.join(rendererRoot, relativePath));
  if (filePath !== rendererRoot && !filePath.startsWith(rendererRoot + path.sep)) {
    return null;
  }
  return filePath;
}
