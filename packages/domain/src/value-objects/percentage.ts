import { ValueObject, guard } from '../core';

interface PercentageProps {
  value: number;
}

export class Percentage extends ValueObject<PercentageProps> {
  private constructor(props: PercentageProps) {
    super(props);
  }

  static create(value: number): Percentage {
    return new Percentage({ value: guard.range(value, 0, 100, 'percentage') });
  }

  get value(): number {
    return this.props.value;
  }
}
