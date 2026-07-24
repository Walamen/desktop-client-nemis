import type { Student } from '@nemis-desktop/domain';
import type {
  StudentGuardianOutput,
  StudentOutput,
  StudentSummaryOutput,
} from '../../dto/students/student-dto';

function toGuardianOutput(link: Student['guardians'][number]): StudentGuardianOutput {
  return { id: link.id, guardianId: link.guardianId, isPrimary: link.isPrimary };
}

export function toStudentOutput(student: Student): StudentOutput {
  return {
    id: student.id,
    institutionId: student.institutionId,
    firstName: student.name.firstName,
    middleName: student.name.middleName,
    lastName: student.name.lastName,
    fullName: student.name.full,
    admissionNumber: student.admissionNumber.value,
    dateOfBirth: student.dateOfBirth.value,
    gender: student.gender,
    gradeLevel: student.gradeLevel,
    admissionDate: student.admissionDate,
    phoneNumber: student.phoneNumber,
    email: student.email,
    address: student.address,
    isActive: student.isActive,
    version: student.version,
    updatedAt: student.updatedAt,
    guardians: student.guardians.map(toGuardianOutput),
  };
}

export function toStudentSummary(student: Student): StudentSummaryOutput {
  return {
    id: student.id,
    fullName: student.name.full,
    admissionNumber: student.admissionNumber.value,
    gradeLevel: student.gradeLevel,
    isActive: student.isActive,
    gender: student.gender,
    updatedAt: student.updatedAt,
  };
}
