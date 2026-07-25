import type { ApprovalStatus, EmploymentType, Gender, StaffPosition } from '@nemis-desktop/types';
import { BusinessRuleViolationException, EntityValidationException } from '../exceptions';
import { Entity } from '../core';

export interface TeacherProps {
  id: string;
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  nationalId?: string;
  phoneNumber: string;
  email?: string;
  address?: string;
  employeeNumber: string;
  position: StaffPosition;
  employmentType: EmploymentType;
  dateOfJoining: string;
  dateOfLeaving?: string;
  qualifications?: Record<string, unknown>;
  isActive: boolean;
  photoUrl?: string;
  approvalStatus: ApprovalStatus;
  approvalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

const required = (value: string, field: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new EntityValidationException('Teacher details are invalid.', [{ field, message: `${field} is required.` }]);
  return normalized;
};

export class Teacher extends Entity<string> {
  private constructor(private props: TeacherProps) {
    super(props.id);
  }

  static create(props: TeacherProps): Teacher {
    const teacher = new Teacher({ ...props });
    teacher.validate();
    return teacher;
  }

  static reconstitute(props: TeacherProps): Teacher {
    return Teacher.create(props);
  }

  get data(): Readonly<TeacherProps> { return this.props; }
  get fullName(): string { return [this.props.firstName, this.props.middleName, this.props.lastName].filter(Boolean).join(' '); }
  get isActive(): boolean { return this.props.isActive; }
  get institutionId(): string { return this.props.institutionId; }
  get employeeNumber(): string { return this.props.employeeNumber; }

  update(changes: Partial<Omit<TeacherProps, 'id' | 'institutionId' | 'createdAt'>>, now: string): void {
    this.props = { ...this.props, ...changes, updatedAt: now };
    this.validate();
  }

  archive(now: string): void {
    if (!this.props.isActive) throw new BusinessRuleViolationException('Teacher is already archived.');
    this.props = { ...this.props, isActive: false, dateOfLeaving: now, updatedAt: now };
  }

  restore(now: string): void {
    if (this.props.isActive) throw new BusinessRuleViolationException('Teacher is already active.');
    this.props = { ...this.props, isActive: true, dateOfLeaving: undefined, updatedAt: now };
  }

  assertAssignable(): void {
    if (!this.props.isActive) throw new BusinessRuleViolationException('Only active teachers may receive assignments.');
  }

  private validate(): void {
    this.props = {
      ...this.props,
      firstName: required(this.props.firstName, 'firstName'),
      lastName: required(this.props.lastName, 'lastName'),
      employeeNumber: required(this.props.employeeNumber, 'employeeNumber'),
      phoneNumber: required(this.props.phoneNumber, 'phoneNumber'),
    };
    if (Number.isNaN(Date.parse(this.props.dateOfBirth))) throw new EntityValidationException('Teacher details are invalid.', [{ field: 'dateOfBirth', message: 'A valid date of birth is required.' }]);
    if (Number.isNaN(Date.parse(this.props.dateOfJoining))) throw new EntityValidationException('Teacher details are invalid.', [{ field: 'dateOfJoining', message: 'A valid joining date is required.' }]);
    if (this.props.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this.props.email)) throw new EntityValidationException('Teacher details are invalid.', [{ field: 'email', message: 'Enter a valid email address.' }]);
  }
}
