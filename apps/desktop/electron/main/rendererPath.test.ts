import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRendererPath } from './rendererPath';

const ROOT = path.resolve('renderer-out');

describe('resolveRendererPath', () => {
  it('maps / to index.html', () => {
    expect(resolveRendererPath(ROOT, '/')).toBe(path.join(ROOT, 'index.html'));
  });

  it('maps a trailing-slash route to its index.html', () => {
    expect(resolveRendererPath(ROOT, '/dashboard/')).toBe(
      path.join(ROOT, 'dashboard', 'index.html'),
    );
  });

  it('maps asset paths directly', () => {
    expect(resolveRendererPath(ROOT, '/_next/static/app.js')).toBe(
      path.join(ROOT, '_next', 'static', 'app.js'),
    );
  });

  it('blocks plain .. traversal', () => {
    expect(resolveRendererPath(ROOT, '/../secret.txt')).toBeNull();
  });

  it('blocks percent-encoded traversal', () => {
    expect(resolveRendererPath(ROOT, '/%2e%2e/secret.txt')).toBeNull();
  });

  it('blocks traversal into sibling directories sharing the root prefix', () => {
    expect(resolveRendererPath(ROOT, '/../renderer-out-evil/x')).toBeNull();
  });

  it('returns the root itself for an empty pathname', () => {
    expect(resolveRendererPath(ROOT, '')).toBe(ROOT);
  });
});
