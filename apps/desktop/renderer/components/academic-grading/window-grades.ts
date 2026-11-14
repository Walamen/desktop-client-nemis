import type { SchoolAdminRecord } from '@nemis-desktop/types';

export interface WindowAssessment {
  id: string;
  name: string;
  type: string;
  totalMarks: number;
  weight: number | null;
  date: string;
}

export interface WindowFinal {
  marksObtained: number;
  maxMarks: number;
  percentage: number | null;
  letterGrade: string | null;
  status: string;
}

export interface WindowGradesSummary {
  classes: number;
  studentsGraded: number;
  finalsSubmitted: number;
  finalsPublished: number;
}

export interface WindowGradesView {
  readonly classIds: readonly string[];
  subjectIdsFor(classId: string): string[];
  assessmentsFor(classId: string, subjectId: string): WindowAssessment[];
  marksFor(studentId: string, assessmentId: string): number | null;
  finalFor(studentId: string, classId: string, subjectId: string): WindowFinal | null;
  readonly summary: WindowGradesSummary;
}

interface IndexedAssessment extends WindowAssessment {
  classId: string;
  subjectId: string;
}

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

function toAssessment(r: SchoolAdminRecord): IndexedAssessment {
  return {
    id: str(r.id),
    classId: str(r.classId),
    subjectId: str(r.subjectId),
    name: str(r.name),
    type: str(r.type),
    totalMarks: Number(r.totalMarks),
    weight: r.weight != null ? Number(r.weight) : null,
    date: str(r.date),
  };
}

function toFinal(r: SchoolAdminRecord): WindowFinal {
  return {
    marksObtained: Number(r.marksObtained),
    maxMarks: Number(r.maxMarks),
    percentage: r.percentage != null ? Number(r.percentage) : null,
    letterGrade: r.letterGrade != null ? String(r.letterGrade) : null,
    status: str(r.status),
  };
}

export function buildWindowGrades(
  grades: readonly SchoolAdminRecord[],
  assessments: readonly SchoolAdminRecord[],
): WindowGradesView {
  const assessmentById = new Map<string, IndexedAssessment>();
  const subjectsByClass = new Map<string, Set<string>>();
  const addSubject = (classId: string, subjectId: string): void => {
    if (!classId || !subjectId) return;
    const set = subjectsByClass.get(classId) ?? new Set<string>();
    set.add(subjectId);
    subjectsByClass.set(classId, set);
  };

  for (const record of assessments) {
    const a = toAssessment(record);
    assessmentById.set(a.id, a);
    addSubject(a.classId, a.subjectId);
  }

  const classIds = new Set<string>();
  const marks = new Map<string, number>();
  const finals = new Map<string, WindowFinal>();
  const gradedStudents = new Set<string>();
  let finalsSubmitted = 0;
  let finalsPublished = 0;

  for (const row of grades) {
    const classId = str(row.classId);
    const studentId = str(row.studentId);
    const assessmentId = row.assessmentId != null ? str(row.assessmentId) : null;
    if (assessmentId !== null && !assessmentById.has(assessmentId)) continue;
    if (classId) classIds.add(classId);
    addSubject(classId, str(row.subjectId));
    if (assessmentId !== null) {
      marks.set(`${studentId}::${assessmentId}`, Number(row.marksObtained));
      continue;
    }
    const final = toFinal(row);
    finals.set(`${studentId}::${classId}::${str(row.subjectId)}`, final);
    gradedStudents.add(studentId);
    if (final.status === 'SUBMITTED') finalsSubmitted += 1;
    if (final.status === 'PUBLISHED') finalsPublished += 1;
  }

  const classIdList = [...classIds];

  return {
    classIds: classIdList,
    subjectIdsFor: (classId) => [...(subjectsByClass.get(classId) ?? [])],
    assessmentsFor: (classId, subjectId) =>
      [...assessmentById.values()]
        .filter((a) => a.classId === classId && a.subjectId === subjectId)
        .sort((x, y) => x.date.localeCompare(y.date) || x.name.localeCompare(y.name))
        .map(({ id, name, type, totalMarks, weight, date }) => ({ id, name, type, totalMarks, weight, date })),
    marksFor: (studentId, assessmentId) => marks.get(`${studentId}::${assessmentId}`) ?? null,
    finalFor: (studentId, classId, subjectId) => finals.get(`${studentId}::${classId}::${subjectId}`) ?? null,
    summary: {
      classes: classIdList.length,
      studentsGraded: gradedStudents.size,
      finalsSubmitted,
      finalsPublished,
    },
  };
}
