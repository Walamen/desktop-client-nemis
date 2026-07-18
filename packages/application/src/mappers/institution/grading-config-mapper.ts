import type { GradingConfig } from '@nemis-desktop/domain';
import type { GradingConfigOutput } from '../../dto/institution/institution-dto';

export function toGradingConfigOutput(config: GradingConfig): GradingConfigOutput {
  return {
    id: config.id,
    maxMarks: config.maxMarks,
    passingMarks: config.passingMarks,
    requireAdminApproval: config.requireAdminApproval,
  };
}
