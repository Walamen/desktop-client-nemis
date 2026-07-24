import type { EnrollmentStatus, Gender, GradeLevel } from '@nemis-desktop/types';

export interface CreateStudentDto {
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  admissionNumber: string;
  dateOfBirth: string; // ISO date
  gender: Gender;
  gradeLevel?: GradeLevel;
  admissionDate?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
}

export interface UpdateStudentDto {
  studentId: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: Gender;
  gradeLevel?: GradeLevel;
  phoneNumber?: string;
  email?: string;
  address?: string;
  actorId?: string;
}

export interface SetStudentActiveDto {
  studentId: string;
  isActive: boolean;
  actorId?: string;
}

export interface CreateGuardianDto {
  studentId: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  isPrimary: boolean;
  actorId?: string;
}

export interface DeactivateStudentDto {
  studentId: string;
  actorId: string;
}

export interface LinkGuardianDto {
  studentId: string;
  guardianId: string;
  isPrimary: boolean;
  actorId: string;
}

export interface ListStudentsDto {
  limit?: number;
  offset?: number;
  keyword?: string;
  gender?: Gender;
  gradeLevel?: GradeLevel;
  classId?: string;
  academicYearId?: string;
  enrollmentStatus?: EnrollmentStatus;
  isActive?: boolean;
  sort?: 'name' | 'admissionNumber' | 'updatedAt';
}

export interface StudentGuardianOutput {
  id: string;
  guardianId: string;
  isPrimary: boolean;
}

export interface StudentOutput {
  id: string;
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName: string;
  admissionNumber: string;
  dateOfBirth: string;
  gender: Gender;
  gradeLevel?: GradeLevel;
  admissionDate?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  isActive: boolean;
  version: number;
  updatedAt: string;
  guardians: StudentGuardianOutput[];
}

export type StudentSummaryOutput = Pick<
  StudentOutput,
  'id' | 'fullName' | 'admissionNumber' | 'gradeLevel' | 'isActive'
> & { gender: Gender; updatedAt: string };
