import { GradeLevel, type GradeLevel as GradeLevelValue } from '@nemis-desktop/types';
import { schoolAdminBridge } from '@/services/nemis-bridge/school-admin';

/** "GRADE_10" -> "Grade 10", "KG" -> "KG" — mirrors portal-web's formatGradeLevel. */
export const formatGrade = (v: string): string => v.replace('_', ' ').replace('GRADE ', 'Grade ');

export const human = (v: string) => v.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const queryId = () =>
  typeof window === 'undefined'
    ? ''
    : (new URLSearchParams(window.location.search).get('id') ?? '');

export const GRADE_GROUPS: { label: string; grades: GradeLevelValue[] }[] = [
  { label: 'Early Years', grades: [GradeLevel.KG, GradeLevel.K1, GradeLevel.K2] },
  {
    label: 'Grades 1–12',
    grades: [
      GradeLevel.GRADE_1, GradeLevel.GRADE_2, GradeLevel.GRADE_3, GradeLevel.GRADE_4,
      GradeLevel.GRADE_5, GradeLevel.GRADE_6, GradeLevel.GRADE_7, GradeLevel.GRADE_8,
      GradeLevel.GRADE_9, GradeLevel.GRADE_10, GradeLevel.GRADE_11, GradeLevel.GRADE_12,
    ],
  },
];

export interface TeacherOnClass {
  teacherId: string;
  firstName: string;
  lastName: string;
  isClassTeacher: boolean;
  subjects: string[];
}

/** Real per-class teacher roster, built from the two bridge calls that
 * already exist for the Teachers module (no new backend work): a class-scoped
 * teacher list, then — for that small set only — each teacher's own
 * assignments filtered down to this class to recover homeroom/subject detail. */
export async function getClassTeacherRoster(classId: string): Promise<TeacherOnClass[]> {
  const page = await schoolAdminBridge.listTeachers({ classId, isActive: true, limit: 100 });
  const roster: TeacherOnClass[] = [];
  for (const teacher of page.items) {
    const assignments = await schoolAdminBridge.listTeachingAssignments(teacher.id);
    const forClass = assignments.filter((a) => a.classId === classId);
    roster.push({
      teacherId: teacher.id,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      isClassTeacher: forClass.some((a) => a.isClassTeacher),
      subjects: forClass.map((a) => a.subjectName).filter((s): s is string => Boolean(s)),
    });
  }
  return roster;
}

export async function countTeachersForClass(classId: string): Promise<number> {
  const page = await schoolAdminBridge.listTeachers({ classId, isActive: true, limit: 1 });
  return page.total;
}

export interface UnassignedStudent {
  id: string;
  fullName: string;
  admissionNumber: string;
  gradeLevel: string | null;
}

/** Active students minus students with at least one active enrollment.
 * There is no "unenrolled" filter on the student list API, so this is
 * computed as a set difference between two real, filtered queries. */
export async function getUnassignedStudents(): Promise<UnassignedStudent[]> {
  const [all, enrolled] = await Promise.all([
    schoolAdminBridge.listStudents({ isActive: true, limit: 2000 }),
    schoolAdminBridge.listStudents({ isActive: true, enrollmentStatus: 'ACTIVE', limit: 2000 }),
  ]);
  const enrolledIds = new Set(enrolled.items.map((s) => s.id));
  return all.items
    .filter((s) => !enrolledIds.has(s.id))
    .map((s) => ({
      id: s.id,
      fullName: s.fullName,
      admissionNumber: s.admissionNumber,
      gradeLevel: s.gradeLevel ?? null,
    }));
}
