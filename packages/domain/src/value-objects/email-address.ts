import { ValueObject } from '../core';
import { InvalidValueObjectException } from '../exceptions';

interface EmailProps {
  value: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailAddress extends ValueObject<EmailProps> {
  private constructor(props: EmailProps) {
    super(props);
  }

  static create(value: string): EmailAddress {
    const normalized = (value ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      throw new InvalidValueObjectException(`Invalid email address: "${value}"`);
    }
    return new EmailAddress({ value: normalized });
  }

  get value(): string {
    return this.props.value;
  }
}
