export const TEACHER_TABS = ['All', 'Grades Pending', 'Pending Approval', 'Unassigned'] as const;
export type TeacherTab = (typeof TEACHER_TABS)[number];

interface TabbedTeacher {
  gradesStatus: string;
  pendingApproval: boolean;
  unassigned: boolean;
}

function inTeacherTab(teacher: TabbedTeacher, tab: TeacherTab): boolean {
  switch (tab) {
    case 'Grades Pending':
      return teacher.gradesStatus === 'Pending';
    case 'Pending Approval':
      return teacher.pendingApproval;
    case 'Unassigned':
      return teacher.unassigned;
    default:
      return true;
  }
}

/** Teacher Monitoring tabs. portal-web lib/deo-dashboard.ts keeps the same rules. */
export function filterTeachersByTab<T extends TabbedTeacher>(teachers: readonly T[], tab: TeacherTab): T[] {
  return teachers.filter((teacher) => inTeacherTab(teacher, tab));
}

export function teacherTabCounts(teachers: readonly TabbedTeacher[]): Record<TeacherTab, number> {
  return Object.fromEntries(
    TEACHER_TABS.map((tab) => [tab, teachers.filter((teacher) => inTeacherTab(teacher, tab)).length]),
  ) as Record<TeacherTab, number>;
}

export interface TeacherSchoolGroup {
  schoolId: string;
  schoolName: string;
  teacherCount: number;
  gradesPending: number;
  pendingApproval: number;
  unassigned: number;
  /** Distinct, sorted. */
  subjects: string[];
  /** Any pending grade, pending approval or unassigned teacher. */
  needsAttention: boolean;
}

/** The "By School" view, by school name. */
export function groupTeachersBySchool(
  teachers: readonly (TabbedTeacher & { schoolId: string; schoolName: string; subjects: readonly string[] })[],
): TeacherSchoolGroup[] {
  const groups = new Map<string, Omit<TeacherSchoolGroup, 'subjects' | 'needsAttention'> & { subjectSet: Set<string> }>();
  for (const teacher of teachers) {
    const group = groups.get(teacher.schoolId) ?? {
      schoolId: teacher.schoolId,
      schoolName: teacher.schoolName,
      teacherCount: 0,
      gradesPending: 0,
      pendingApproval: 0,
      unassigned: 0,
      subjectSet: new Set<string>(),
    };
    group.teacherCount += 1;
    if (teacher.gradesStatus === 'Pending') group.gradesPending += 1;
    if (teacher.pendingApproval) group.pendingApproval += 1;
    if (teacher.unassigned) group.unassigned += 1;
    teacher.subjects.forEach((subject) => group.subjectSet.add(subject));
    groups.set(teacher.schoolId, group);
  }
  return [...groups.values()]
    .map(({ subjectSet, ...group }) => ({
      ...group,
      subjects: [...subjectSet].sort((a, b) => a.localeCompare(b)),
      needsAttention: group.gradesPending + group.pendingApproval + group.unassigned > 0,
    }))
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName));
}
