import { schoolAdminBridge } from '@/services/nemis-bridge/school-admin';
import { formatGrade } from '@/components/classes/shared';

export const human = (value: string): string =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

/** Mirrors portal-web's formatClassName(gradeLevel, section). */
export function formatClassName(gradeLevel: string, section?: string | null): string {
  const gradeName = formatGrade(gradeLevel);
  return section && section.trim() ? `${gradeName} ${section.trim()}` : gradeName;
}

export interface ClassTeacherOption {
  teacherId: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  subjects: { subjectId: string; subjectName: string }[];
}

/** Teachers assigned to a class, paired with the subjects each of them
 * teaches in that specific class — mirrors portal-web's
 * useGetClassTeachersQuery + SubjectSelect filtering, built from the same
 * two real bridge calls already used by the Teachers and Classes modules
 * (class-scoped teacher list, then each teacher's own assignments filtered
 * down to this class). */
export async function getClassTeacherSubjects(classId: string): Promise<ClassTeacherOption[]> {
  const page = await schoolAdminBridge.listTeachers({ classId, isActive: true, limit: 100 });
  const options: ClassTeacherOption[] = [];
  for (const teacher of page.items) {
    const assignments = await schoolAdminBridge.listTeachingAssignments(teacher.id);
    const subjects = assignments
      .filter((a) => a.classId === classId && a.subjectId && a.subjectName)
      .map((a) => ({ subjectId: a.subjectId!, subjectName: a.subjectName! }));
    options.push({
      teacherId: teacher.id,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      photoUrl: teacher.photoUrl,
      subjects,
    });
  }
  return options;
}

/** Client-side CSV export of the currently visible grid — an honest stand-in
 * for portal-web's jsPDF/xlsx-based "Export PDF" / "Export Excel" buttons,
 * which depend on libraries that aren't part of this app. Print (native
 * window.print) covers the polished-document case for real. */
export function downloadTimetableCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
