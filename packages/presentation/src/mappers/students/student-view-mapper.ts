import type { StudentOutput, StudentSummaryOutput } from '@nemis-desktop/application';
import { formatIsoDate, formatIsoDateTime } from '../../formatters/format-date';
import { formatGradeLevel, humanizeEnum } from '../../formatters/format-text';
import { presentActive } from '../../presenters/present-status';
import type { StudentDetailsView, StudentRowView } from '../../view-models/students/students-views';

export function toStudentRowView(dto: StudentSummaryOutput): StudentRowView {
  return {
    id: dto.id,
    fullName: dto.fullName,
    admissionNumber: dto.admissionNumber,
    gradeLevel: formatGradeLevel(dto.gradeLevel),
    status: presentActive(dto.isActive),
  };
}

export function toStudentDetailsView(dto: StudentOutput): StudentDetailsView {
  return {
    id: dto.id,
    institutionId: dto.institutionId,
    fullName: dto.fullName,
    admissionNumber: dto.admissionNumber,
    dateOfBirth: formatIsoDate(dto.dateOfBirth),
    gender: humanizeEnum(dto.gender),
    gradeLevel: formatGradeLevel(dto.gradeLevel),
    status: presentActive(dto.isActive),
    guardianCount: dto.guardians.length,
    updatedAt: formatIsoDateTime(dto.updatedAt),
  };
}
