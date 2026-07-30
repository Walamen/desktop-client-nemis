import type {
  AssignTeacherRequest,
  CreateTeacherRequest,
  RemoveTeachingAssignmentRequest,
  SetTeacherActiveRequest,
  TeacherListRequest,
  TeacherPageResult,
  TeacherProfileResult,
  TeachingAssignmentResult,
  UpdateTeacherRequest,
  UpdateTeachingAssignmentRequest,
} from '@nemis-desktop/types';
import { api } from '../api';

/** Staff-directory management — school admins creating/editing teacher
 * records and teaching assignments. The teacher's own dashboard lives in
 * nemis-bridge/teacher/ instead. */
export const teacherDirectoryBridge = {
  listTeachers: (request: TeacherListRequest): Promise<TeacherPageResult> =>
    api().teacher.list(request),
  getTeacherProfile: (id: string): Promise<TeacherProfileResult | null> => api().teacher.getProfile(id),
  createTeacher: (request: CreateTeacherRequest): Promise<TeacherProfileResult> =>
    api().teacher.create(request),
  updateTeacher: (request: UpdateTeacherRequest): Promise<TeacherProfileResult> =>
    api().teacher.update(request),
  setTeacherActive: (request: SetTeacherActiveRequest): Promise<TeacherProfileResult> =>
    api().teacher.setActive(request),
  listTeachingAssignments: (id: string): Promise<TeachingAssignmentResult[]> =>
    api().teacher.listAssignments(id),
  assignTeacher: (request: AssignTeacherRequest): Promise<TeachingAssignmentResult> =>
    api().teacher.assign(request),
  updateTeachingAssignment: (
    request: UpdateTeachingAssignmentRequest,
  ): Promise<TeachingAssignmentResult> => api().teacher.updateAssignment(request),
  removeTeachingAssignment: (request: RemoveTeachingAssignmentRequest): Promise<{ id: string }> =>
    api().teacher.removeAssignment(request),
};
