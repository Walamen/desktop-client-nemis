import type { Assessment } from '@nemis-desktop/domain';

export interface IAssessmentRepository {
  findById(id: string): Assessment | null;
  save(assessment: Assessment): void;
}
