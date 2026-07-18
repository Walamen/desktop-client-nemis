import { Specification } from '../../core';
import { ApprovalStatus } from '@nemis-desktop/types';

export class IsInstitutionApproved extends Specification<{ approvalStatus: ApprovalStatus }> {
  isSatisfiedBy(candidate: { approvalStatus: ApprovalStatus }): boolean {
    return candidate.approvalStatus === ApprovalStatus.APPROVED;
  }
}
