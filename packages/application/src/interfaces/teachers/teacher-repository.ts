import type { Teacher } from '@nemis-desktop/domain';
import type {
  AssignTeacherRequest,
  TeacherDashboardResult,
  TeacherListRequest,
  TeachingAssignmentResult,
  UpdateTeachingAssignmentRequest,
} from '@nemis-desktop/types';

export interface TeacherPageFilter extends Required<Pick<TeacherListRequest, 'limit' | 'offset'>>, Omit<TeacherListRequest, 'limit' | 'offset'> {}

export interface ITeacherRepository {
  findById(id: string): Teacher | null;
  findPage(filter: TeacherPageFilter): { items: Teacher[]; total: number };
  existsByEmployeeNumber(institutionId: string, employeeNumber: string, excludeId?: string): boolean;
  existsByEmail(email: string, excludeId?: string): boolean;
  save(teacher: Teacher): void;
  listAssignments(teacherId: string): TeachingAssignmentResult[];
  findAssignment(assignmentId: string): TeachingAssignmentResult | null;
  findClassSubjectAssignment(classId: string, subjectId: string): TeachingAssignmentResult | null;
  assign(request: AssignTeacherRequest, assignmentId: string, assignedAt: string): TeachingAssignmentResult;
  updateAssignment(request: UpdateTeachingAssignmentRequest, assignedAt: string): TeachingAssignmentResult;
  removeAssignment(assignmentId: string): void;
  dashboard(): TeacherDashboardResult;
}
