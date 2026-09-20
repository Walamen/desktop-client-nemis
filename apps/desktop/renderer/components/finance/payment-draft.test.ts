import { describe, expect, it } from 'vitest';
import { capAmountInput, methodRequiresReference, validatePaymentDraft } from './payment-draft';

const draft = (over: Partial<{ amount: string; method: string; reference: string }> = {}) => ({
  amount: '100',
  method: 'CASH',
  reference: '',
  ...over,
});

describe('methodRequiresReference', () => {
  it('requires a reference for the three non-cash methods', () => {
    expect(methodRequiresReference('BANK_TRANSFER')).toBe(true);
    expect(methodRequiresReference('MOBILE_MONEY')).toBe(true);
    expect(methodRequiresReference('CHEQUE')).toBe(true);
  });

  it('does not require one for cash', () => {
    expect(methodRequiresReference('CASH')).toBe(false);
  });
});

describe('capAmountInput', () => {
  it('keeps a keystroke that stays within the remaining balance', () => {
    expect(capAmountInput('250', 3000)).toBe('250');
  });

  it('rejects a keystroke that would exceed the remaining balance', () => {
    expect(capAmountInput('3001', 3000)).toBeNull();
  });

  it('accepts exactly the remaining balance', () => {
    expect(capAmountInput('3000', 3000)).toBe('3000');
  });

  it('lets a cleared or partial entry through so the field can be edited', () => {
    // Mid-typing states ('' and '.') parse to NaN — rejecting them would trap
    // the cursor and make the field impossible to clear.
    expect(capAmountInput('', 3000)).toBe('');
    expect(capAmountInput('.', 3000)).toBe('.');
  });
});

describe('validatePaymentDraft', () => {
  it('accepts a well-formed cash draft', () => {
    expect(validatePaymentDraft(draft(), 3000)).toBeNull();
  });

  it('rejects a non-numeric or empty amount', () => {
    expect(validatePaymentDraft(draft({ amount: '' }), 3000)).toEqual({ code: 'INVALID_AMOUNT' });
    expect(validatePaymentDraft(draft({ amount: 'abc' }), 3000)).toEqual({ code: 'INVALID_AMOUNT' });
  });

  it('rejects a zero or negative amount', () => {
    expect(validatePaymentDraft(draft({ amount: '0' }), 3000)).toEqual({ code: 'INVALID_AMOUNT' });
    expect(validatePaymentDraft(draft({ amount: '-5' }), 3000)).toEqual({ code: 'INVALID_AMOUNT' });
  });

  it('rejects an amount above the remaining balance', () => {
    expect(validatePaymentDraft(draft({ amount: '3001' }), 3000)).toEqual({
      code: 'EXCEEDS_BALANCE',
      maxAmount: 3000,
    });
  });

  it('tolerates floating-point dust at exactly the balance', () => {
    // Mirrors the old modal's `value > maxAmount + 0.001` guard: 0.1 + 0.2
    // lands a hair above 0.3, and that must not be reported as an overpayment.
    expect(validatePaymentDraft(draft({ amount: String(0.1 + 0.2) }), 0.3)).toBeNull();
  });

  it('requires a reference for a cheque payment', () => {
    expect(validatePaymentDraft(draft({ method: 'CHEQUE' }), 3000)).toEqual({ code: 'REFERENCE_REQUIRED' });
  });

  it('rejects a whitespace-only reference', () => {
    expect(validatePaymentDraft(draft({ method: 'CHEQUE', reference: '   ' }), 3000)).toEqual({
      code: 'REFERENCE_REQUIRED',
    });
  });

  it('accepts a cheque payment carrying a reference', () => {
    expect(validatePaymentDraft(draft({ method: 'CHEQUE', reference: 'CHQ-881' }), 3000)).toBeNull();
  });

  it('reports the amount problem before the missing reference', () => {
    expect(validatePaymentDraft(draft({ amount: '0', method: 'CHEQUE' }), 3000)).toEqual({
      code: 'INVALID_AMOUNT',
    });
  });
});
