import { ValueObject, guard } from '../core';

interface NationalIdProps {
  value: string;
}

export class NationalId extends ValueObject<NationalIdProps> {
  private constructor(props: NationalIdProps) {
    super(props);
  }

  static create(value: string): NationalId {
    return new NationalId({ value: guard.againstEmpty(value, 'nationalId') });
  }

  get value(): string {
    return this.props.value;
  }
}
