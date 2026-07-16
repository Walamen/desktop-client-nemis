import { describe, expect, it } from 'vitest';
import { assertNoArgs, assertSettingKeyArg } from './validateIpc';

describe('assertNoArgs', () => {
  it('passes empty args and rejects extras', () => {
    expect(() => assertNoArgs([])).not.toThrow();
    expect(() => assertNoArgs(['x'])).toThrow();
  });
});

describe('assertSettingKeyArg', () => {
  it('accepts exactly one bounded non-empty string', () => {
    expect(() => assertSettingKeyArg(['theme'])).not.toThrow();
  });

  it('rejects wrong arity', () => {
    expect(() => assertSettingKeyArg([])).toThrow();
    expect(() => assertSettingKeyArg(['a', 'b'])).toThrow();
  });

  it('rejects non-strings, empty, and oversized keys', () => {
    expect(() => assertSettingKeyArg([42])).toThrow();
    expect(() => assertSettingKeyArg([null])).toThrow();
    expect(() => assertSettingKeyArg([{ key: 'theme' }])).toThrow();
    expect(() => assertSettingKeyArg([''])).toThrow();
    expect(() => assertSettingKeyArg(['k'.repeat(129)])).toThrow();
  });
});
