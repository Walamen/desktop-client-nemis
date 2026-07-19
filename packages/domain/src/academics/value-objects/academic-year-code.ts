import { ValueObject } from '../../core';
import { InvalidValueObjectException } from '../../exceptions';

interface AcademicYearCodeProps {
  value: string;
}

const CODE_RE = /^\d{4}\/\d{4}$/;

export class AcademicYearCode extends ValueObject<AcademicYearCodeProps> {
  private constructor(props: AcademicYearCodeProps) {
    super(props);
  }

  static create(value: string): AcademicYearCode {
    const normalized = (value ?? '').trim();
    if (!CODE_RE.test(normalized)) {
      throw new InvalidValueObjectException(
        `Invalid academic year code: "${value}" (expected YYYY/YYYY)`,
      );
    }
    return new AcademicYearCode({ value: normalized });
  }

  get value(): string {
    return this.props.value;
  }
}
