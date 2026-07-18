import { ValueObject, guard } from '../core';

interface DobProps {
  value: string;
}

export class DateOfBirth extends ValueObject<DobProps> {
  private constructor(props: DobProps) {
    super(props);
  }

  static create(value: string): DateOfBirth {
    return new DateOfBirth({ value: guard.notFuture(value, 'dateOfBirth') });
  }

  get value(): string {
    return this.props.value;
  }

  /** Whole years old on the given ISO date. */
  ageOn(iso: string): number {
    const birth = new Date(this.props.value);
    const at = new Date(iso);
    let age = at.getUTCFullYear() - birth.getUTCFullYear();
    const beforeBirthday =
      at.getUTCMonth() < birth.getUTCMonth() ||
      (at.getUTCMonth() === birth.getUTCMonth() && at.getUTCDate() < birth.getUTCDate());
    if (beforeBirthday) age -= 1;
    return age;
  }
}
