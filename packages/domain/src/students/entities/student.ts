import { AggregateRoot } from '../../core';
import type { EntityId } from '../../core';
import { DateOfBirth, PersonName } from '../../value-objects';
import { BusinessRuleViolationException } from '../../exceptions';
import type { Gender, GradeLevel } from '@nemis-desktop/types';
import { NemisId } from '../value-objects/nemis-id';
import { StudentGuardian } from './student-guardian';
import type { StudentCreatedEvent } from '../events/student-created';

export type StudentId = EntityId<'Student'>;

interface StudentState {
  institutionId: string;
  name: PersonName;
  /** Absent only for a legacy row pulled in before the NEMIS ID rollout
   * (migration 024 deliberately leaves it NULL). A blank ID here means "the
   * next server pull will fill this in" — never mint one locally. */
  nemisId: NemisId | undefined;
  dateOfBirth: DateOfBirth;
  gender: Gender;
  gradeLevel?: GradeLevel;
  admissionDate?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  isActive: boolean;
  guardians: StudentGuardian[];
}

export interface CreateStudentInput {
  id: string;
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  nemisId: string;
  dateOfBirth: string;
  gender: Gender;
  gradeLevel?: GradeLevel;
  admissionDate?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  occurredAt: string;
}

export interface ReconstituteStudentInput {
  id: string;
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  /** Undefined only for a legacy row with no NEMIS ID yet (see StudentState.nemisId). */
  nemisId?: string;
  dateOfBirth: string;
  gender: Gender;
  gradeLevel?: GradeLevel;
  admissionDate?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
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

  /** Only path for a NEW student. Unlike reconstitute(), this REQUIRES a
   * valid nemisId — a brand-new local record must never be created without
   * one, since there is no future sync pull to backfill it. */
  static create(input: CreateStudentInput): Student {
    const nemisId = NemisId.create(input.nemisId);
    const student = new Student(
      input.id as StudentId,
      {
        institutionId: input.institutionId,
        name: PersonName.create({
          firstName: input.firstName,
          middleName: input.middleName,
          lastName: input.lastName,
        }),
        nemisId,
        dateOfBirth: DateOfBirth.create(input.dateOfBirth),
        gender: input.gender,
        gradeLevel: input.gradeLevel,
        admissionDate: input.admissionDate,
        phoneNumber: input.phoneNumber,
        email: input.email,
        address: input.address,
        isActive: true,
        guardians: [],
      },
      { version: 1, updatedAt: input.occurredAt },
    );
    const event: StudentCreatedEvent = {
      name: 'StudentCreated',
      aggregateId: student.id,
      occurredAt: input.occurredAt,
      nemisId: nemisId.value,
      institutionId: input.institutionId,
    };
    student.addEvent(event);
    return student;
  }

  /** Rehydrates an EXISTING row. Unlike create(), nemisId is OPTIONAL here:
   * a student pulled in before migration 024's rollout has NULL until the
   * next server sync fills it in. Never mint one to paper over the gap. */
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
        nemisId: input.nemisId === undefined ? undefined : NemisId.create(input.nemisId),
        dateOfBirth: DateOfBirth.create(input.dateOfBirth),
        gender: input.gender,
        gradeLevel: input.gradeLevel,
        admissionDate: input.admissionDate,
        phoneNumber: input.phoneNumber,
        email: input.email,
        address: input.address,
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
  /** Absent for a legacy row awaiting its first post-rollout sync pull. */
  get nemisId(): NemisId | undefined {
    return this.#state.nemisId;
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
  get admissionDate(): string | undefined { return this.#state.admissionDate; }
  get phoneNumber(): string | undefined { return this.#state.phoneNumber; }
  get email(): string | undefined { return this.#state.email; }
  get address(): string | undefined { return this.#state.address; }

  updateProfile(input: { firstName?: string; middleName?: string; lastName?: string; dateOfBirth?: string; gender?: Gender; gradeLevel?: GradeLevel; phoneNumber?: string; email?: string; address?: string }, by: string, at: string): void {
    if (!this.#state.isActive) throw new BusinessRuleViolationException('Archived students cannot be modified');
    this.#state = {
      ...this.#state,
      name: PersonName.create({ firstName: input.firstName ?? this.name.firstName, middleName: input.middleName ?? this.name.middleName, lastName: input.lastName ?? this.name.lastName }),
      dateOfBirth: input.dateOfBirth ? DateOfBirth.create(input.dateOfBirth) : this.#state.dateOfBirth,
      gender: input.gender ?? this.#state.gender,
      gradeLevel: input.gradeLevel ?? this.#state.gradeLevel,
      phoneNumber: input.phoneNumber ?? this.#state.phoneNumber,
      email: input.email ?? this.#state.email,
      address: input.address ?? this.#state.address,
    };
    this.touch(by, at);
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
  activate(by: string, at: string): void {
    if (this.#state.isActive) return;
    this.#state = { ...this.#state, isActive: true };
    this.touch(by, at);
  }
}
