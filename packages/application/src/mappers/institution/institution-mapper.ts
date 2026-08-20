import type { Institution } from '@nemis-desktop/domain';
import { type InstitutionLevel, getAllowedGradesForLevels } from '@nemis-desktop/types';
import type {
  InstitutionProfileOutput,
  InstitutionSummaryOutput,
} from '../../dto/institution/institution-dto';

/** The school's registered education levels arrive as an opaque `levels` key
 * inside the synced `profile` JSON bag (see Institution domain entity) —
 * there's no dedicated column for it. Falls back to an empty array (which
 * `getAllowedGradesForLevels` treats as "allow everything") when absent. */
function readInstitutionLevels(institution: Institution): InstitutionLevel[] {
  const levels = institution.profile.levels;
  return Array.isArray(levels) ? (levels as InstitutionLevel[]) : [];
}

export function toInstitutionProfileOutput(institution: Institution): InstitutionProfileOutput {
  return {
    id: institution.id,
    code: institution.code.value,
    name: institution.name,
    type: institution.type,
    ownership: institution.ownership,
    approvalStatus: institution.approvalStatus,
    isApproved: institution.isApproved,
    street: institution.address.street,
    communityTown: institution.address.communityTown,
    allowedGrades: getAllowedGradesForLevels(readInstitutionLevels(institution)),
  };
}

export function toInstitutionSummaryOutput(
  institution: Institution,
  districtName: string | undefined,
  studentCount: number,
): InstitutionSummaryOutput {
  return {
    id: institution.id,
    code: institution.code.value,
    name: institution.name,
    type: institution.type,
    ownership: institution.ownership,
    districtId: institution.districtId,
    districtName,
    approvalStatus: institution.approvalStatus,
    studentCount,
  };
}
