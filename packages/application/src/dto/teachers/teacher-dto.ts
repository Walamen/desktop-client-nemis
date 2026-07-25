import type {
  AssignTeacherRequest,
  CreateTeacherRequest,
  RemoveTeachingAssignmentRequest,
  SetTeacherActiveRequest,
  TeacherDashboardResult,
  TeacherListRequest,
  TeacherPageResult,
  TeacherProfileResult,
  TeacherResult,
  TeachingAssignmentResult,
  UpdateTeacherRequest,
  UpdateTeachingAssignmentRequest,
} from '@nemis-desktop/types';

export type CreateTeacherDto = CreateTeacherRequest;
export type UpdateTeacherDto = UpdateTeacherRequest;
export type SetTeacherActiveDto = SetTeacherActiveRequest;
export type ListTeachersDto = TeacherListRequest;
export type AssignTeacherDto = AssignTeacherRequest;
export type UpdateTeachingAssignmentDto = UpdateTeachingAssignmentRequest;
export type RemoveTeachingAssignmentDto = RemoveTeachingAssignmentRequest;
export type TeacherOutput = TeacherResult;
export type TeacherProfileOutput = TeacherProfileResult;
export type TeacherPageOutput = TeacherPageResult;
export type TeachingAssignmentOutput = TeachingAssignmentResult;
export type TeacherDashboardOutput = TeacherDashboardResult;
