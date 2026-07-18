import { Entity } from '../../core';
import { guard } from '../../core';
import type { PeriodType } from '@nemis-desktop/types';

interface GradingPeriodProps {
  id: string;
  institutionId: string;
  name: string;
  periodType: PeriodType;
  sequence: number;
  maxMarks: number;
  passingMarks: number;
}

export class GradingPeriod extends Entity<string> {
  #props: GradingPeriodProps;

  private constructor(props: GradingPeriodProps) {
    super(props.id);
    this.#props = { ...props, name: guard.againstEmpty(props.name, 'name') };
  }

  static reconstitute(props: GradingPeriodProps): GradingPeriod {
    return new GradingPeriod(props);
  }

  get name(): string {
    return this.#props.name;
  }
  get periodType(): PeriodType {
    return this.#props.periodType;
  }
  get sequence(): number {
    return this.#props.sequence;
  }
  get maxMarks(): number {
    return this.#props.maxMarks;
  }
  get passingMarks(): number {
    return this.#props.passingMarks;
  }
}
