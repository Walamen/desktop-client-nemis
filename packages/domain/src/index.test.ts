import { describe, expect, it } from 'vitest';
import * as domain from './index';

describe('@nemis-desktop/domain package', () => {
  it('exposes a module namespace', () => {
    expect(typeof domain).toBe('object');
  });
});
