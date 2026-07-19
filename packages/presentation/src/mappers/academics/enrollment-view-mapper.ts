import type { ClassRosterOutput, EnrollmentOutput } from '@nemis-desktop/application';
import { EnrollmentStatus } from '@nemis-desktop/types';
import { formatIsoDateTime } from '../../formatters/format-date';
import { presentEnrollmentStatus } from '../../presenters/present-status';
import type {
  ClassRosterView,
  EnrollmentRowView,
} from '../../view-models/class-roster/class-roster-views';

export function toEnrollmentRowView(dto: EnrollmentOutput): EnrollmentRowView {
  return {
    id: dto.id,
    studentId: dto.studentId,
    classId: dto.classId,
    status: presentEnrollmentStatus(dto.status),
    updatedAt: formatIsoDateTime(dto.updatedAt),
  };
}

export function toClassRosterView(dto: ClassRosterOutput): ClassRosterView {
  return {
    classId: dto.classId,
    enrollments: dto.enrollments.map(toEnrollmentRowView),
    activeCount: dto.enrollments.filter((e) => e.status === EnrollmentStatus.ACTIVE).length,
  };
}
