import { AggregateRoot } from '../../core';
import type { EntityId } from '../../core';
import { DateOfBirth, PersonName } from '../../value-objects';
import { BusinessRuleViolationException } from '../../exceptions';
import type { Gender, GradeLevel } from '@nemis-desktop/types';
import { AdmissionNumber } from '../value-objects/admission-number';
import { StudentGuardian } from './student-guardian';
import type { StudentCreatedEvent } from '../events/student-created';

export type StudentId = EntityId<'Student'>;

interface StudentState {
  institutionId: string;
  name: PersonName;
  admissionNumber: AdmissionNumber;
  dateOfBirth: DateOfBirth;
  gender: Gender;
  gradeLevel?: GradeLevel;
  isActive: boolean;
  guardians: StudentGuardian[];
}

export interface CreateStudentInput {
  id: string;
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  admissionNumber: string;
  dateOfBirth: string;
  gender: Gender;
  gradeLevel?: GradeLevel;
  occurredAt: string;
}

export interface ReconstituteStudentInput {
  id: string;
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  admissionNumber: string;
  dateOfBirth: string;
  gender: Gender;
  gradeLevel?: GradeLevel;
  isActive: boolean;
  guardians: StudentGuardian[];
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export class Student extends AggregateRoot<StudentId> {
  #state: StudentState;

  private constructor(
    id: StudentId,
    state: StudentState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  static create(input: CreateStudentInput): Student {
    const student = new Student(
      input.id as StudentId,
      {
        institutionId: input.institutionId,
        name: PersonName.create({
          firstName: input.firstName,
          middleName: input.middleName,
          lastName: input.lastName,
        }),
        admissionNumber: AdmissionNumber.create(input.admissionNumber),
        dateOfBirth: DateOfBirth.create(input.dateOfBirth),
        gender: input.gender,
        gradeLevel: input.gradeLevel,
        isActive: true,
        guardians: [],
      },
      { version: 1, updatedAt: input.occurredAt },
    );
    const event: StudentCreatedEvent = {
      name: 'StudentCreated',
      aggregateId: student.id,
      occurredAt: input.occurredAt,
      admissionNumber: student.admissionNumber.value,
      institutionId: input.institutionId,
    };
    student.addEvent(event);
    return student;
  }

  static reconstitute(input: ReconstituteStudentInput): Student {
    return new Student(
      input.id as StudentId,
      {
        institutionId: input.institutionId,
        name: PersonName.create({
          firstName: input.firstName,
          middleName: input.middleName,
          lastName: input.lastName,
        }),
        admissionNumber: AdmissionNumber.create(input.admissionNumber),
        dateOfBirth: DateOfBirth.create(input.dateOfBirth),
        gender: input.gender,
        gradeLevel: input.gradeLevel,
        isActive: input.isActive,
        guardians: [...input.guardians],
      },
      { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy },
    );
  }

  get institutionId(): string {
    return this.#state.institutionId;
  }
  get name(): PersonName {
    return this.#state.name;
  }
  get admissionNumber(): AdmissionNumber {
    return this.#state.admissionNumber;
  }
  get dateOfBirth(): DateOfBirth {
    return this.#state.dateOfBirth;
  }
  get gender(): Gender {
    return this.#state.gender;
  }
  get gradeLevel(): GradeLevel | undefined {
    return this.#state.gradeLevel;
  }
  get isActive(): boolean {
    return this.#state.isActive;
  }
  get guardians(): readonly StudentGuardian[] {
    return this.#state.guardians;
  }

  addGuardian(link: StudentGuardian, by: string, at: string): void {
    if (link.isPrimary && this.#state.guardians.some((g) => g.isPrimary)) {
      throw new BusinessRuleViolationException('Student already has a primary guardian');
    }
    this.#state = { ...this.#state, guardians: [...this.#state.guardians, link] };
    this.touch(by, at);
  }

  deactivate(by: string, at: string): void {
    if (!this.#state.isActive) return;
    this.#state = { ...this.#state, isActive: false };
    this.touch(by, at);
  }
}
