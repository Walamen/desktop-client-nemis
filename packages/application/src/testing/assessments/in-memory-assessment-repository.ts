import type { Assessment } from '@nemis-desktop/domain';
import type { IAssessmentRepository } from '../../interfaces/assessments/assessment-repository';

export class InMemoryAssessmentRepository implements IAssessmentRepository {
  readonly store = new Map<string, Assessment>();
  findById(id: string): Assessment | null {
    return this.store.get(id) ?? null;
  }
  save(assessment: Assessment): void {
    this.store.set(assessment.id, assessment);
  }
}
