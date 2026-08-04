import { sharedBridge } from '@/services/nemis-bridge/shared';
import type { SchoolAdminRecord } from '@nemis-desktop/types';

export interface AssessmentTemplateRow {
  id: string;
  classId: string;
  subjectId: string;
  name: string;
  type: string;
  totalMarks: number;
  weight: number | null;
  date: string;
}

export interface AssessmentInstanceRow {
  id: string;
  templateId: string;
  classId: string;
  subjectId: string;
  gradingPeriodId: string;
}

export function toAssessmentTemplateRow(r: SchoolAdminRecord): AssessmentTemplateRow {
  return {
    id: String(r.id),
    classId: String(r.classId),
    subjectId: String(r.subjectId),
    name: String(r.name),
    type: String(r.type),
    totalMarks: Number(r.totalMarks),
    weight: r.weight != null ? Number(r.weight) : null,
    date: String(r.date),
  };
}

function toAssessmentInstanceRow(r: SchoolAdminRecord): AssessmentInstanceRow {
  return {
    id: String(r.id),
    templateId: String(r.templateId),
    classId: String(r.classId),
    subjectId: String(r.subjectId),
    gradingPeriodId: String(r.gradingPeriodId),
  };
}

/** Same client-side-filter approach as listPeriodsForTerm/listAllWindows in
 * shared.tsx — the generic offline collection API has no server-side filter
 * beyond collection + pagination. */
export async function listTemplatesForSubject(
  classId: string,
  subjectId: string,
): Promise<AssessmentTemplateRow[]> {
  const result = await sharedBridge.listSchoolAdminRecords({ collection: 'assessment_templates', limit: 250 });
  return result.items
    .filter((item) => item.classId === classId && item.subjectId === subjectId)
    .map(toAssessmentTemplateRow);
}

export async function listAssessmentsForPeriod(
  classId: string,
  subjectId: string,
  gradingPeriodId: string,
): Promise<AssessmentInstanceRow[]> {
  const result = await sharedBridge.listSchoolAdminRecords({ collection: 'assessments', limit: 250 });
  return result.items
    .filter(
      (item) =>
        item.classId === classId &&
        item.subjectId === subjectId &&
        item.gradingPeriodId === gradingPeriodId,
    )
    .map(toAssessmentInstanceRow);
}

/** Finds or creates the Assessment instance for this template+period —
 * desktop's two-step stand-in for the web backend's atomic
 * `Assessment.upsert` inside saveAssessmentScores. See the design doc's
 * "Materializing an Assessment instance offline" section. */
export async function materializeAssessment(
  template: AssessmentTemplateRow,
  gradingPeriodId: string,
): Promise<string> {
  const existing = await listAssessmentsForPeriod(template.classId, template.subjectId, gradingPeriodId);
  const match = existing.find((row) => row.templateId === template.id);
  if (match) return match.id;
  const created = await sharedBridge.saveSchoolAdminRecord({
    collection: 'assessments',
    record: {
      templateId: template.id,
      classId: template.classId,
      subjectId: template.subjectId,
      gradingPeriodId,
      name: template.name,
      type: template.type,
      totalMarks: template.totalMarks,
      weight: template.weight,
      date: template.date,
    },
  });
  return String(created.id);
}

/** Σ (score/totalMarks × weight) across every template the student has a
 * score for — templates with no score entered are skipped, not treated as
 * zero (matches the running-total display, not a penalty for ungraded
 * work). Returns null when nothing has been scored yet. */
export function weightedPercentage(
  scores: ReadonlyMap<string, number | null>,
  templates: readonly AssessmentTemplateRow[],
): number | null {
  let sum = 0;
  let hasScore = false;
  for (const template of templates) {
    const score = scores.get(template.id);
    if (score == null || template.totalMarks <= 0) continue;
    hasScore = true;
    sum += (score / template.totalMarks) * (template.weight ?? 0);
  }
  return hasScore ? Math.round(sum * 100) / 100 : null;
}

export function totalWeight(templates: readonly AssessmentTemplateRow[]): number {
  return templates.reduce((sum, t) => sum + (t.weight ?? 0), 0);
}
