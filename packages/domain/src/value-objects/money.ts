import { ValueObject } from '../core';
import { InvalidValueObjectException } from '../exceptions';

interface MoneyProps {
  amount: number;
  currency: string;
}

export class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  static create(input: { amount: number; currency?: string }): Money {
    if (Number.isNaN(input.amount) || input.amount < 0) {
      throw new InvalidValueObjectException('Money amount must be a non-negative number');
    }
    return new Money({ amount: input.amount, currency: input.currency ?? 'LRD' });
  }

  get amount(): number {
    return this.props.amount;
  }
  get currency(): string {
    return this.props.currency;
  }

  add(other: Money): Money {
    if (other.currency !== this.props.currency) {
      throw new InvalidValueObjectException(
        `Cannot add ${other.currency} to ${this.props.currency}`,
      );
    }
    return Money.create({ amount: this.props.amount + other.amount, currency: this.props.currency });
  }
}
