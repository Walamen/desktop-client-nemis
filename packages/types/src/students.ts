import type { EnrollmentStatus, Gender, GradeLevel } from './enums';
import type { PagedListResult } from './academics';

export interface StudentResult {
  id: string;
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName: string;
  admissionNumber: string;
  admissionDate?: string;
  dateOfBirth: string;
  gender: Gender;
  gradeLevel?: GradeLevel;
  phoneNumber?: string;
  email?: string;
  address?: string;
  isActive: boolean;
  version: number;
  updatedAt: string;
  guardians: { id: string; guardianId: string; isPrimary: boolean }[];
}
export interface StudentListItemResult {
  id: string;
  fullName: string;
  admissionNumber: string;
  gradeLevel?: GradeLevel;
  gender: Gender;
  isActive: boolean;
  updatedAt: string;
}
export interface StudentListRequest {
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
export interface CreateStudentRequest {
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  admissionNumber: string;
  admissionDate?: string;
  dateOfBirth: string;
  gender: Gender;
  gradeLevel?: GradeLevel;
  phoneNumber?: string;
  email?: string;
  address?: string;
}
export interface UpdateStudentRequest {
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
}
export interface SetStudentActiveRequest {
  studentId: string;
  isActive: boolean;
}
export interface CreateGuardianRequest {
  studentId: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  email?: string;
  isPrimary: boolean;
}
export interface EnrollStudentRequest {
  studentId: string;
  classId: string;
  academicYearId: string;
  termId: string;
  enrollmentDate?: string;
}
export interface MoveEnrollmentClassRequest {
  enrollmentId: string;
  targetClassId: string;
}
export interface EnrollmentResult {
  id: string;
  studentId: string;
  classId: string;
  academicYearId: string;
  termId: string;
  enrollmentDate: string;
  status: EnrollmentStatus;
  version: number;
  updatedAt: string;
}
export type StudentPageResult = PagedListResult<StudentListItemResult>;

export interface StudentStatisticsResult {
  totalStudents: number;
  maleStudents: number;
  femaleStudents: number;
  recentEnrollments: number;
}
