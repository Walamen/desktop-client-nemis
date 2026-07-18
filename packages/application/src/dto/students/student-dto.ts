import type { Gender, GradeLevel } from '@nemis-desktop/types';

export interface CreateStudentDto {
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  admissionNumber: string;
  dateOfBirth: string; // ISO date
  gender: Gender;
  gradeLevel?: GradeLevel;
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
  isActive: boolean;
  version: number;
  updatedAt: string;
  guardians: StudentGuardianOutput[];
}

export type StudentSummaryOutput = Pick<
  StudentOutput,
  'id' | 'fullName' | 'admissionNumber' | 'gradeLevel' | 'isActive'
>;
