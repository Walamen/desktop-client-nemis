import { describe, expect, it } from 'vitest';
import { ABI_MISMATCH_HINT, isAbiMismatch } from './abiMismatch';

function dlopenError(): Error {
  const error = new Error(
    "The module 'better_sqlite3.node' was compiled against a different Node.js version",
  );
  (error as Error & { code: string }).code = 'ERR_DLOPEN_FAILED';
  return error;
}

describe('isAbiMismatch', () => {
  it('detects ERR_DLOPEN_FAILED directly', () => {
    expect(isAbiMismatch(dlopenError())).toBe(true);
  });

  it('detects a NODE_MODULE_VERSION message without a code', () => {
    expect(isAbiMismatch(new Error('was compiled against NODE_MODULE_VERSION 146'))).toBe(true);
  });

  it('detects the mismatch anywhere on the cause chain', () => {
    const wrapped = new Error('Cannot open database', {
      cause: new Error('driver failed', { cause: dlopenError() }),
    });
    expect(isAbiMismatch(wrapped)).toBe(true);
  });

  it('survives circular cause chains', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    (a as Error & { cause?: unknown }).cause = b;
    expect(isAbiMismatch(a)).toBe(false);
  });

  it('returns false for unrelated errors and non-errors', () => {
    expect(isAbiMismatch(new Error('SQLITE_BUSY'))).toBe(false);
    expect(isAbiMismatch('string')).toBe(false);
    expect(isAbiMismatch(null)).toBe(false);
  });
});

describe('ABI_MISMATCH_HINT', () => {
  it('names both swap commands so the fix is actionable from the log alone', () => {
    expect(ABI_MISMATCH_HINT).toContain('pnpm rebuild:electron');
    expect(ABI_MISMATCH_HINT).toContain('pnpm rebuild:node');
  });
});
