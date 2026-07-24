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
    gender: humanizeEnum(dto.gender),
    status: presentActive(dto.isActive),
  };
}

export function toStudentDetailsView(dto: StudentOutput): StudentDetailsView {
  return {
    id: dto.id,
    institutionId: dto.institutionId,
    fullName: dto.fullName,
    firstName: dto.firstName,
    middleName: dto.middleName,
    lastName: dto.lastName,
    admissionNumber: dto.admissionNumber,
    dateOfBirth: formatIsoDate(dto.dateOfBirth),
    rawDateOfBirth: dto.dateOfBirth,
    gender: humanizeEnum(dto.gender),
    gradeLevel: formatGradeLevel(dto.gradeLevel),
    status: presentActive(dto.isActive),
    guardianCount: dto.guardians.length,
    guardians: dto.guardians,
    phoneNumber: dto.phoneNumber,
    email: dto.email,
    address: dto.address,
    rawGender: dto.gender,
    rawGradeLevel: dto.gradeLevel,
    updatedAt: formatIsoDateTime(dto.updatedAt),
  };
}
