import type { Assessment } from '@nemis-desktop/domain';
import type { AssessmentOutput } from '../../dto/assessments/assessments-dto';

export function toAssessmentOutput(assessment: Assessment): AssessmentOutput {
  return {
    id: assessment.id,
    type: assessment.type,
    obtainedMarks: assessment.marks.obtained,
    totalMarks: assessment.marks.total,
    version: assessment.version,
    updatedAt: assessment.updatedAt,
  };
}
