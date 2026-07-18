import { Entity } from '../../core';
import { DateRange } from '../../value-objects';
import { guard } from '../../core';

interface TermProps {
  id: string;
  academicYearId: string;
  name: string;
  start: string;
  end: string;
  isCurrent: boolean;
}

export class Term extends Entity<string> {
  #academicYearId: string;
  #name: string;
  #period: DateRange;
  #isCurrent: boolean;

  private constructor(props: TermProps) {
    super(props.id);
    this.#academicYearId = props.academicYearId;
    this.#name = guard.againstEmpty(props.name, 'name');
    this.#period = DateRange.create({ start: props.start, end: props.end });
    this.#isCurrent = props.isCurrent;
  }

  static reconstitute(props: TermProps): Term {
    return new Term(props);
  }

  get academicYearId(): string {
    return this.#academicYearId;
  }
  get name(): string {
    return this.#name;
  }
  get period(): DateRange {
    return this.#period;
  }
  get isCurrent(): boolean {
    return this.#isCurrent;
  }
}
