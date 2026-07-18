import { ValueObject, guard } from '../../core';

interface AdmissionNumberProps {
  value: string;
}

export class AdmissionNumber extends ValueObject<AdmissionNumberProps> {
  private constructor(props: AdmissionNumberProps) {
    super(props);
  }

  static create(value: string): AdmissionNumber {
    return new AdmissionNumber({ value: guard.againstEmpty(value, 'admissionNumber') });
  }

  get value(): string {
    return this.props.value;
  }
}
