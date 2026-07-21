import { AggregateRoot, guard } from '../../core';
import { DateRange } from '../../value-objects';
import type { TermCreatedEvent } from '../events/term-created';

export interface CreateTermInput {
  id: string;
  academicYearId: string;
  name: string;
  start: string;
  end: string;
  isCurrent?: boolean;
  occurredAt: string;
}

export interface ReconstituteTermInput {
  id: string;
  academicYearId: string;
  name: string;
  start: string;
  end: string;
  isCurrent: boolean;
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export class Term extends AggregateRoot<string> {
  #academicYearId: string;
  #name: string;
  #period: DateRange;
  #isCurrent: boolean;

  private constructor(
    id: string,
    fields: { academicYearId: string; name: string; period: DateRange; isCurrent: boolean },
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#academicYearId = fields.academicYearId;
    this.#name = fields.name;
    this.#period = fields.period;
    this.#isCurrent = fields.isCurrent;
  }

  static create(input: CreateTermInput): Term {
    const term = new Term(
      input.id,
      {
        academicYearId: input.academicYearId,
        name: guard.againstEmpty(input.name, 'name'),
        period: DateRange.create({ start: input.start, end: input.end }),
        isCurrent: input.isCurrent ?? false,
      },
      { version: 1, updatedAt: input.occurredAt },
    );
    const event: TermCreatedEvent = {
      name: 'TermCreated',
      aggregateId: term.id,
      occurredAt: input.occurredAt,
      academicYearId: term.academicYearId,
      termName: term.name,
    };
    term.addEvent(event);
    return term;
  }

  static reconstitute(input: ReconstituteTermInput): Term {
    return new Term(
      input.id,
      {
        academicYearId: input.academicYearId,
        name: guard.againstEmpty(input.name, 'name'),
        period: DateRange.create({ start: input.start, end: input.end }),
        isCurrent: input.isCurrent,
      },
      { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy },
    );
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

  rename(name: string, by: string | undefined, at: string): void {
    const next = guard.againstEmpty(name, 'name');
    if (next === this.#name) return;
    this.#name = next;
    this.touch(by, at);
  }

  reschedule(start: string, end: string, by: string | undefined, at: string): void {
    this.#period = DateRange.create({ start, end });
    this.touch(by, at);
  }

  makeCurrent(by: string | undefined, at: string): void {
    if (this.#isCurrent) return;
    this.#isCurrent = true;
    this.touch(by, at);
  }

  clearCurrent(by: string | undefined, at: string): void {
    if (!this.#isCurrent) return;
    this.#isCurrent = false;
    this.touch(by, at);
  }
}
