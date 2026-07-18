import type { AssessmentType, GradeStatus } from '@nemis-desktop/types';

export interface CreateAssessmentDto {
  classId: string;
  subjectId: string;
  gradingPeriodId: string;
  type: AssessmentType;
  totalMarks: number;
}

export interface RecordGradeDto {
  studentId: string;
  subjectId: string;
  obtained: number;
  total: number;
  status: GradeStatus;
}

export interface PublishGradeDto {
  gradeId: string;
  actorId: string;
}

export interface GetGradesByStudentDto {
  studentId: string;
}

export interface AssessmentOutput {
  id: string;
  type: AssessmentType;
  obtainedMarks: number;
  totalMarks: number;
  version: number;
  updatedAt: string;
}

export interface GradeOutput {
  id: string;
  studentId: string;
  subjectId: string;
  obtained: number;
  total: number;
  status: GradeStatus;
  isPublished: boolean;
  version: number;
  updatedAt: string;
}
