import { AggregateRoot } from '../../core';
import { DateRange } from '../../value-objects';
import { AcademicYearCode } from '../value-objects/academic-year-code';

export interface ReconstituteAcademicYearInput {
  id: string;
  institutionId: string;
  code: string;
  start: string;
  end: string;
  isCurrent: boolean;
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export class AcademicYear extends AggregateRoot<string> {
  #institutionId: string;
  #code: AcademicYearCode;
  #period: DateRange;
  #isCurrent: boolean;

  private constructor(
    id: string,
    institutionId: string,
    code: AcademicYearCode,
    period: DateRange,
    isCurrent: boolean,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#institutionId = institutionId;
    this.#code = code;
    this.#period = period;
    this.#isCurrent = isCurrent;
  }

  static reconstitute(input: ReconstituteAcademicYearInput): AcademicYear {
    return new AcademicYear(
      input.id,
      input.institutionId,
      AcademicYearCode.create(input.code),
      DateRange.create({ start: input.start, end: input.end }),
      input.isCurrent,
      { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy },
    );
  }

  get institutionId(): string {
    return this.#institutionId;
  }
  get code(): AcademicYearCode {
    return this.#code;
  }
  get period(): DateRange {
    return this.#period;
  }
  get isCurrent(): boolean {
    return this.#isCurrent;
  }

  makeCurrent(by: string, at: string): void {
    if (this.#isCurrent) return;
    this.#isCurrent = true;
    this.touch(by, at);
  }
}
