import type { GradingConfigOutput, InstitutionProfileOutput } from '@nemis-desktop/application';
import { humanizeEnum } from '../../formatters/format-text';
import { presentApprovalStatus } from '../../presenters/present-status';
import type {
  GradingConfigView,
  InstitutionProfileView,
} from '../../view-models/settings/settings-views';

export function toInstitutionProfileView(dto: InstitutionProfileOutput): InstitutionProfileView {
  const address = [dto.street, dto.communityTown].filter(Boolean).join(', ');
  return {
    id: dto.id,
    code: dto.code,
    name: dto.name,
    typeLabel: humanizeEnum(dto.type),
    ownershipLabel: humanizeEnum(dto.ownership),
    approval: presentApprovalStatus(dto.approvalStatus),
    address: address === '' ? '—' : address,
  };
}

export function toGradingConfigView(dto: GradingConfigOutput): GradingConfigView {
  return {
    id: dto.id,
    maxMarks: dto.maxMarks,
    passingMarks: dto.passingMarks,
    requireAdminApproval: dto.requireAdminApproval,
  };
}
