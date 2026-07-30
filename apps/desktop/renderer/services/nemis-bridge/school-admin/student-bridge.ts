import type {
  CreateGuardianRequest,
  CreateStudentRequest,
  EnrollStudentRequest,
  EnrollmentResult,
  MoveEnrollmentClassRequest,
  SetStudentActiveRequest,
  StudentListRequest,
  StudentPageResult,
  StudentResult,
  StudentStatisticsResult,
  UpdateStudentRequest,
} from '@nemis-desktop/types';
import { api } from '../api';

export const studentBridge = {
  listStudents: (request: StudentListRequest): Promise<StudentPageResult> =>
    api().student.list(request),
  getStudent: (id: string): Promise<StudentResult | null> => api().student.get(id),
  createStudent: (request: CreateStudentRequest): Promise<StudentResult> =>
    api().student.create(request),
  updateStudent: (request: UpdateStudentRequest): Promise<StudentResult> =>
    api().student.update(request),
  setStudentActive: (request: SetStudentActiveRequest): Promise<StudentResult> =>
    api().student.setActive(request),
  createStudentGuardian: (request: CreateGuardianRequest): Promise<StudentResult> =>
    api().student.createGuardian(request),
  enrollStudent: (request: EnrollStudentRequest): Promise<EnrollmentResult> =>
    api().student.enroll(request),
  moveEnrollmentClass: (request: MoveEnrollmentClassRequest): Promise<EnrollmentResult> =>
    api().student.moveClass(request),
  listStudentEnrollments: (id: string): Promise<EnrollmentResult[]> =>
    api().student.listEnrollments(id),
  getStudentStatistics: (): Promise<StudentStatisticsResult> => api().student.getStatistics(),
};
