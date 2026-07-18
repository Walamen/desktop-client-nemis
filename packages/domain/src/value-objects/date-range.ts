import { ValueObject, guard } from '../core';
import { InvalidValueObjectException } from '../exceptions';

interface DateRangeProps {
  start: string;
  end: string;
}

export class DateRange extends ValueObject<DateRangeProps> {
  private constructor(props: DateRangeProps) {
    super(props);
  }

  static create(input: DateRangeProps): DateRange {
    const start = guard.iso(input.start, 'start');
    const end = guard.iso(input.end, 'end');
    if (Date.parse(start) > Date.parse(end)) {
      throw new InvalidValueObjectException('DateRange start must not be after end');
    }
    return new DateRange({ start, end });
  }

  get start(): string {
    return this.props.start;
  }
  get end(): string {
    return this.props.end;
  }

  contains(iso: string): boolean {
    const t = Date.parse(iso);
    return t >= Date.parse(this.props.start) && t <= Date.parse(this.props.end);
  }
}
