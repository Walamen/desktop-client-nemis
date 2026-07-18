import { ValueObject, guard } from '../../core';

interface SchoolCodeProps {
  value: string;
}

export class SchoolCode extends ValueObject<SchoolCodeProps> {
  private constructor(props: SchoolCodeProps) {
    super(props);
  }

  static create(value: string): SchoolCode {
    return new SchoolCode({ value: guard.againstEmpty(value, 'schoolCode').toUpperCase() });
  }

  get value(): string {
    return this.props.value;
  }
}
