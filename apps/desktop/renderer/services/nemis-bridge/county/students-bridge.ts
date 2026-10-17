import type {
  CountyStudentDetail,
  CountyStudentsQuery,
  CountyStudentsResult,
  StudentAcademicRecordResult,
} from '@nemis-desktop/types';
import { api } from '../api';

export const studentsBridge = {
  listStudents: (query: CountyStudentsQuery): Promise<CountyStudentsResult> => api().county.listStudents(query),
  getStudent: (studentId: string): Promise<CountyStudentDetail | null> => api().county.getStudent(studentId),
  /** The student's national record (online only); 'unavailable' offline or on any failure. */
  getStudentRecord: (studentId: string): Promise<StudentAcademicRecordResult> =>
    api().county.getStudentRecord(studentId),
};
