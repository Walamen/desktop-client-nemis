import type { CountyTeacherDetail, CountyTeachersQuery, CountyTeachersResult } from '@nemis-desktop/types';
import { api } from '../api';

export const teachersBridge = {
  listTeachers: (query: CountyTeachersQuery): Promise<CountyTeachersResult> => api().county.listTeachers(query),
  getTeacher: (teacherId: string): Promise<CountyTeacherDetail | null> => api().county.getTeacher(teacherId),
};
