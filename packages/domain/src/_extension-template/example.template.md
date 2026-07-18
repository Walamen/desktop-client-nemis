# Example skeleton: FeePayment (finance domain)

Copy and adapt. Uses the cross-cutting `Money` value object.

    // finance/entities/fee-payment.ts
    import { AggregateRoot } from '../../core';
    import { Money } from '../../value-objects';
    import { InvalidStateException } from '../../exceptions';
    import type { PaymentMethod } from '@nemis-desktop/types';

    export interface RecordFeePaymentInput {
      id: string;
      obligationId: string;
      studentId: string;
      amount: number;
      currency?: string;
      method: PaymentMethod;
      receiptNumber: string;
      occurredAt: string;
    }

    export class FeePayment extends AggregateRoot<string> {
      // ...state incl. Money.create({ amount, currency }), isReversed=false...
      static record(input: RecordFeePaymentInput): FeePayment { /* emit FeePaymentRecorded */ }
      reverse(reason: string, by: string, at: string): void {
        // guard: already reversed -> InvalidStateException; else flip + touch + event
      }
    }
