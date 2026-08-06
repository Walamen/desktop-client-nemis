import type { TeachingAssignmentResult } from '@nemis-desktop/types';

export interface AssignmentClassOption {
  classId: string;
  className: string;
  subjects: { id: string; name: string }[];
}

/** Groups a teacher's flat teaching-assignment rows into per-class options
 * with only the subjects assigned to them there — the same grouping
 * AttendancePage.tsx and MyClassesPage.tsx already use, skipping any
 * plain-homeroom row with no subject attached. */
export function groupClassesWithSubjects(
  assignments: readonly TeachingAssignmentResult[],
): AssignmentClassOption[] {
  const byClass = new Map<string, AssignmentClassOption>();
  for (const a of assignments) {
    if (!a.subjectId || !a.subjectName) continue;
    const existing = byClass.get(a.classId);
    if (existing) {
      if (!existing.subjects.some((s) => s.id === a.subjectId)) {
        existing.subjects.push({ id: a.subjectId, name: a.subjectName });
      }
    } else {
      byClass.set(a.classId, {
        classId: a.classId,
        className: a.section ? `${a.className} — ${a.section}` : a.className,
        subjects: [{ id: a.subjectId, name: a.subjectName }],
      });
    }
  }
  return Array.from(byClass.values());
}
