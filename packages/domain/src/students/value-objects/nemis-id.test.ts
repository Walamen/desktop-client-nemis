import { describe, expect, it } from 'vitest';
import { NemisId } from './nemis-id';
import { InvalidValueObjectException } from '../../exceptions';

describe('NemisId', () => {
  it('accepts a valid id', () => {
    expect(NemisId.create('482915736045').value).toBe('482915736045');
  });

  it('accepts and canonicalises a formatted id', () => {
    expect(NemisId.create('4829-1573-6045').value).toBe('482915736045');
  });

  it('rejects a bad check digit', () => {
    expect(() => NemisId.create('482915736042')).toThrow(/not a valid NEMIS ID/i);
    expect(() => NemisId.create('482915736042')).toThrow(InvalidValueObjectException);
  });

  it('rejects an empty value', () => {
    expect(() => NemisId.create('')).toThrow(/not a valid NEMIS ID/i);
    expect(() => NemisId.create('')).toThrow(InvalidValueObjectException);
  });
});
