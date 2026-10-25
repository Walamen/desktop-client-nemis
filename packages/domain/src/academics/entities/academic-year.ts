import { AggregateRoot } from '../../core';
import { BusinessRuleViolationException } from '../../exceptions';
import { DateRange } from '../../value-objects';
import { AcademicYearStatus } from '@nemis-desktop/types';
import { AcademicYearCode } from '../value-objects/academic-year-code';
import type { AcademicYearCreatedEvent } from '../events/academic-year-created';

export interface CreateAcademicYearInput {
  id: string;
  institutionId: string;
  code: string;
  start: string;
  end: string;
  occurredAt: string;
}

export interface ReconstituteAcademicYearInput {
  id: string;
  institutionId: string;
  code: string;
  start: string;
  end: string;
  isCurrent: boolean;
  /** Rows written before migration 003 default to ACTIVE. Server-owned. */
  status?: AcademicYearStatus;
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export class AcademicYear extends AggregateRoot<string> {
  #institutionId: string;
  #code: AcademicYearCode;
  #period: DateRange;
  #isCurrent: boolean;
  #status: AcademicYearStatus;

  private constructor(
    id: string,
    institutionId: string,
    code: AcademicYearCode,
    period: DateRange,
    isCurrent: boolean,
    status: AcademicYearStatus,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#institutionId = institutionId;
    this.#code = code;
    this.#period = period;
    this.#isCurrent = isCurrent;
    this.#status = status;
  }

  static create(input: CreateAcademicYearInput): AcademicYear {
    const year = new AcademicYear(
      input.id,
      input.institutionId,
      AcademicYearCode.create(input.code),
      DateRange.create({ start: input.start, end: input.end }),
      false,
      AcademicYearStatus.SETUP,
      { version: 1, updatedAt: input.occurredAt },
    );
    const event: AcademicYearCreatedEvent = {
      name: 'AcademicYearCreated',
      aggregateId: year.id,
      occurredAt: input.occurredAt,
      institutionId: year.institutionId,
      code: year.code.value,
    };
    year.addEvent(event);
    return year;
  }

  static reconstitute(input: ReconstituteAcademicYearInput): AcademicYear {
    return new AcademicYear(
      input.id,
      input.institutionId,
      AcademicYearCode.create(input.code),
      DateRange.create({ start: input.start, end: input.end }),
      input.isCurrent,
      input.status ?? AcademicYearStatus.ACTIVE,
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
  get status(): AcademicYearStatus {
    return this.#status;
  }

  rename(code: string, by: string | undefined, at: string): void {
    this.#requireOpen('renamed');
    const next = AcademicYearCode.create(code);
    if (next.value === this.#code.value) return;
    this.#code = next;
    this.touch(by, at);
  }

  reschedule(start: string, end: string, by: string | undefined, at: string): void {
    this.#requireOpen('rescheduled');
    this.#period = DateRange.create({ start, end });
    this.touch(by, at);
  }

  #requireOpen(action: string): void {
    if (this.#status === AcademicYearStatus.CLOSED) {
      throw new BusinessRuleViolationException(`A closed academic year cannot be ${action}.`);
    }
  }
}
