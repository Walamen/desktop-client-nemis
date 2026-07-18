import { ValueObject } from '../core';
import { InvalidValueObjectException } from '../exceptions';

interface PhoneProps {
  value: string;
}

const PHONE_RE = /^\+?[0-9]{7,15}$/;

export class PhoneNumber extends ValueObject<PhoneProps> {
  private constructor(props: PhoneProps) {
    super(props);
  }

  static create(value: string): PhoneNumber {
    const normalized = (value ?? '').replace(/[\s-]/g, '');
    if (!PHONE_RE.test(normalized)) {
      throw new InvalidValueObjectException(`Invalid phone number: "${value}"`);
    }
    return new PhoneNumber({ value: normalized });
  }

  get value(): string {
    return this.props.value;
  }
}
