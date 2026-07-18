import { ValueObject } from '../core';
import { InvalidValueObjectException } from '../exceptions';
import { Percentage } from './percentage';

interface MarksProps {
  obtained: number;
  total: number;
}

export class Marks extends ValueObject<MarksProps> {
  private constructor(props: MarksProps) {
    super(props);
  }

  static create(input: MarksProps): Marks {
    if (input.total <= 0) {
      throw new InvalidValueObjectException('Marks total must be greater than zero');
    }
    if (input.obtained < 0 || input.obtained > input.total) {
      throw new InvalidValueObjectException('Marks obtained must be between 0 and total');
    }
    return new Marks({ obtained: input.obtained, total: input.total });
  }

  get obtained(): number {
    return this.props.obtained;
  }
  get total(): number {
    return this.props.total;
  }
  get percentage(): Percentage {
    return Percentage.create((this.props.obtained / this.props.total) * 100);
  }
}
