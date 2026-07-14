import path from 'node:path';

/**
 * Maps an app:// URL pathname onto a file inside the renderer root.
 * Returns null when the resolved path escapes the root (path traversal).
 * trailingSlash exports mean every route directory maps to index.html.
 */
export function resolveRendererPath(rendererRoot: string, pathname: string): string | null {
  let relativePath = decodeURIComponent(pathname);
  if (relativePath.endsWith('/')) {
    relativePath += 'index.html';
  }
  const filePath = path.normalize(path.join(rendererRoot, relativePath));
  if (filePath !== rendererRoot && !filePath.startsWith(rendererRoot + path.sep)) {
    return null;
  }
  return filePath;
}
