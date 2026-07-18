import type { EnrollmentStatus } from '@nemis-desktop/types';

export interface EnrollStudentDto {
  studentId: string;
  classId: string;
  academicYearId: string;
  termId: string;
  actorId?: string;
}

export interface WithdrawEnrollmentDto {
  enrollmentId: string;
  actorId: string;
}

export interface GetClassRosterDto {
  classId: string;
}

export interface EnrollmentOutput {
  id: string;
  studentId: string;
  classId: string;
  status: EnrollmentStatus;
  version: number;
  updatedAt: string;
}

export interface ClassRosterOutput {
  classId: string;
  enrollments: EnrollmentOutput[];
}
