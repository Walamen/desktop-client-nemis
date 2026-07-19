import type { AssessmentOutput, GradeOutput } from '@nemis-desktop/application';
import { formatIsoDateTime } from '../../formatters/format-date';
import { formatMarks, formatPercent } from '../../formatters/format-marks';
import { humanizeEnum } from '../../formatters/format-text';
import { presentGradeStatus } from '../../presenters/present-status';
import type { AssessmentView, GradeRowView } from '../../view-models/assessments/assessments-views';

export function toGradeRowView(dto: GradeOutput): GradeRowView {
  return {
    id: dto.id,
    studentId: dto.studentId,
    subjectId: dto.subjectId,
    marks: formatMarks(dto.obtained, dto.total),
    percent: formatPercent(dto.obtained, dto.total),
    status: presentGradeStatus(dto.status, dto.isPublished),
  };
}

export function toAssessmentView(dto: AssessmentOutput): AssessmentView {
  return {
    id: dto.id,
    typeLabel: humanizeEnum(dto.type),
    marks: formatMarks(dto.obtainedMarks, dto.totalMarks),
    updatedAt: formatIsoDateTime(dto.updatedAt),
  };
}
