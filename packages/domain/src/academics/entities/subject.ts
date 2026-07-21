import { AggregateRoot, guard } from '../../core';
import type { SubjectCreatedEvent } from '../events/subject-created';

/** Subject codes are stored trimmed and uppercased so uniqueness checks are
 * case-insensitive (backend stores what admins type; the desktop normalizes). */
function normalizeCode(code: string): string {
  return guard.againstEmpty(code, 'code').toUpperCase();
}

export interface CreateSubjectInput {
  id: string;
  institutionId: string;
  name: string;
  code: string;
  description?: string;
  occurredAt: string;
}

export interface ReconstituteSubjectInput {
  id: string;
  institutionId: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export interface UpdateSubjectFields {
  name?: string;
  code?: string;
  /** null clears the description; undefined leaves it unchanged. */
  description?: string | null;
}

export class Subject extends AggregateRoot<string> {
  #institutionId: string;
  #name: string;
  #code: string;
  #description?: string;
  #isActive: boolean;

  private constructor(
    id: string,
    fields: {
      institutionId: string;
      name: string;
      code: string;
      description?: string;
      isActive: boolean;
    },
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#institutionId = fields.institutionId;
    this.#name = fields.name;
    this.#code = fields.code;
    this.#description = fields.description;
    this.#isActive = fields.isActive;
  }

  static create(input: CreateSubjectInput): Subject {
    const subject = new Subject(
      input.id,
      {
        institutionId: input.institutionId,
        name: guard.againstEmpty(input.name, 'name'),
        code: normalizeCode(input.code),
        description: input.description?.trim() || undefined,
        isActive: true,
      },
      { version: 1, updatedAt: input.occurredAt },
    );
    const event: SubjectCreatedEvent = {
      name: 'SubjectCreated',
      aggregateId: subject.id,
      occurredAt: input.occurredAt,
      institutionId: subject.institutionId,
      subjectCode: subject.code,
    };
    subject.addEvent(event);
    return subject;
  }

  static reconstitute(input: ReconstituteSubjectInput): Subject {
    return new Subject(
      input.id,
      {
        institutionId: input.institutionId,
        name: guard.againstEmpty(input.name, 'name'),
        code: normalizeCode(input.code),
        description: input.description,
        isActive: input.isActive,
      },
      { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy },
    );
  }

  get institutionId(): string {
    return this.#institutionId;
  }
  get name(): string {
    return this.#name;
  }
  get code(): string {
    return this.#code;
  }
  get description(): string | undefined {
    return this.#description;
  }
  get isActive(): boolean {
    return this.#isActive;
  }

  update(fields: UpdateSubjectFields, by: string, at: string): void {
    if (fields.name !== undefined) this.#name = guard.againstEmpty(fields.name, 'name');
    if (fields.code !== undefined) this.#code = normalizeCode(fields.code);
    if (fields.description !== undefined) {
      this.#description =
        fields.description === null ? undefined : fields.description.trim() || undefined;
    }
    this.touch(by, at);
  }

  deactivate(by: string, at: string): void {
    if (!this.#isActive) return;
    this.#isActive = false;
    this.touch(by, at);
  }

  activate(by: string, at: string): void {
    if (this.#isActive) return;
    this.#isActive = true;
    this.touch(by, at);
  }
}
