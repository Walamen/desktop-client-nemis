/** Grade label as the DEO School detail page shows it (mirrors portal-web):
 * KG -> "Kindergarten", K1/K2 as is, GRADE_n -> "Grade n", null -> "Grade not set". */
export function deoGradeLabel(grade: string | null): string {
  if (!grade) return 'Grade not set';
  if (grade === 'KG') return 'Kindergarten';
  if (grade.startsWith('GRADE_')) return `Grade ${grade.slice('GRADE_'.length)}`;
  return grade;
}
