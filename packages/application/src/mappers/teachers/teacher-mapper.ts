import type { Teacher } from '@nemis-desktop/domain';
import type { TeacherResult } from '@nemis-desktop/types';

export function toTeacherOutput(teacher: Teacher): TeacherResult {
  return { ...teacher.data };
}
