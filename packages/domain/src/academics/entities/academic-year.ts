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
  isCurrent?: boolean;
  occurredAt: string;
}

export interface ReconstituteAcademicYearInput {
  id: string;
  institutionId: string;
  code: string;
  start: string;
  end: string;
  isCurrent: boolean;
  /** Rows written before migration 003 default to ACTIVE. */
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
      input.isCurrent ?? false,
      AcademicYearStatus.ACTIVE,
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
    this.#requireActive('renamed');
    const next = AcademicYearCode.create(code);
    if (next.value === this.#code.value) return;
    this.#code = next;
    this.touch(by, at);
  }

  reschedule(start: string, end: string, by: string | undefined, at: string): void {
    this.#requireActive('rescheduled');
    this.#period = DateRange.create({ start, end });
    this.touch(by, at);
  }

  makeCurrent(by: string | undefined, at: string): void {
    if (this.#status !== AcademicYearStatus.ACTIVE) {
      throw new BusinessRuleViolationException(
        `A ${this.#status.toLowerCase()} academic year cannot be made current.`,
      );
    }
    if (this.#isCurrent) return;
    this.#isCurrent = true;
    this.touch(by, at);
  }

  clearCurrent(by: string | undefined, at: string): void {
    if (!this.#isCurrent) return;
    this.#isCurrent = false;
    this.touch(by, at);
  }

  close(by: string | undefined, at: string): void {
    if (this.#status !== AcademicYearStatus.ACTIVE) {
      throw new BusinessRuleViolationException('Only an active academic year can be closed.');
    }
    this.#requireNotCurrent('closed');
    this.#status = AcademicYearStatus.CLOSED;
    this.touch(by, at);
  }

  archive(by: string | undefined, at: string): void {
    if (this.#status === AcademicYearStatus.ARCHIVED) return;
    this.#requireNotCurrent('archived');
    this.#status = AcademicYearStatus.ARCHIVED;
    this.touch(by, at);
  }

  restore(by: string | undefined, at: string): void {
    if (this.#status === AcademicYearStatus.ACTIVE) return;
    this.#status = AcademicYearStatus.ACTIVE;
    this.touch(by, at);
  }

  #requireActive(action: string): void {
    if (this.#status !== AcademicYearStatus.ACTIVE) {
      throw new BusinessRuleViolationException(
        `A ${this.#status.toLowerCase()} academic year cannot be ${action}.`,
      );
    }
  }

  #requireNotCurrent(action: string): void {
    if (this.#isCurrent) {
      throw new BusinessRuleViolationException(
        `The current academic year cannot be ${action}. Set another year as current first.`,
      );
    }
  }
}
