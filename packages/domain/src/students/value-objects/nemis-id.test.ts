import { describe, expect, it } from 'vitest';
import { NemisId } from './nemis-id';

describe('NemisId', () => {
  it('accepts a valid id', () => {
    expect(NemisId.create('482915736045').value).toBe('482915736045');
  });

  it('accepts and canonicalises a formatted id', () => {
    expect(NemisId.create('4829-1573-6045').value).toBe('482915736045');
  });

  it('rejects a bad check digit', () => {
    expect(() => NemisId.create('482915736042')).toThrow(/not a valid NEMIS ID/i);
  });

  it('rejects an empty value', () => {
    expect(() => NemisId.create('')).toThrow(/not a valid NEMIS ID/i);
  });
});
