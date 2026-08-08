import type { Institution } from '@nemis-desktop/domain';
import type {
  InstitutionProfileOutput,
  InstitutionSummaryOutput,
} from '../../dto/institution/institution-dto';

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
