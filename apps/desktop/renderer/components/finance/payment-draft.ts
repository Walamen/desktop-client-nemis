/** Pure validation for one row's payment entry on the Record Payment table.
 *
 * Deliberately free of bridge/UI imports so it can be unit-tested directly —
 * the row component owns the wording, this module owns the rules. Errors are
 * returned as codes rather than sentences because the message needs the
 * caller's currency formatter. */

export const METHODS_REQUIRING_REFERENCE = ['BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE'] as const;

/** Cash is the only method the school can evidence without a document number. */
export function methodRequiresReference(method: string): boolean {
  return (METHODS_REQUIRING_REFERENCE as readonly string[]).includes(method);
}

export interface PaymentDraft {
  amount: string;
  method: string;
  reference: string;
}

export type PaymentDraftError =
  | { code: 'INVALID_AMOUNT' }
  | { code: 'EXCEEDS_BALANCE'; maxAmount: number }
  | { code: 'REFERENCE_REQUIRED' };

/** Guards the amount field per keystroke: returns the value to keep, or null
 * when the keystroke would push the entry past the remaining balance and
 * should be swallowed. Mid-typing values that don't parse yet ('', '.', '-')
 * pass through — rejecting them would make the field impossible to clear. */
export function capAmountInput(raw: string, maxAmount: number): string | null {
  const value = parseFloat(raw);
  if (Number.isNaN(value)) return raw;
  return value > maxAmount ? null : raw;
}

/** Full-draft check run on save. Amount problems are reported ahead of a
 * missing reference so the cashier fixes the money first. */
export function validatePaymentDraft(draft: PaymentDraft, maxAmount: number): PaymentDraftError | null {
  const value = parseFloat(draft.amount);
  if (Number.isNaN(value) || value <= 0) return { code: 'INVALID_AMOUNT' };
  // The 0.001 slack absorbs float dust (0.1 + 0.2 > 0.3) so an exact-balance
  // payment is never reported as an overpayment.
  if (value > maxAmount + 0.001) return { code: 'EXCEEDS_BALANCE', maxAmount };
  if (methodRequiresReference(draft.method) && !draft.reference.trim()) return { code: 'REFERENCE_REQUIRED' };
  return null;
}
