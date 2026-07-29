import type { SchoolAdminRecord } from '@nemis-desktop/types';

export const human = (v: string) => v.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export interface StudentLite {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  gradeLevel: string | null;
  isActive: boolean;
}

export interface GuardianRow {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  email: string | null;
  address: string | null;
  occupation: string | null;
  isEmergencyContact: boolean;
  updatedAt: string;
  children: StudentLite[];
  isPrimaryContact: boolean;
}

const str = (v: SchoolAdminRecord[string] | undefined): string => (v === null || v === undefined ? '' : String(v));
const strOrNull = (v: SchoolAdminRecord[string] | undefined): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);
const bool = (v: SchoolAdminRecord[string] | undefined): boolean => v === true || v === 1 || v === '1';

/** Joins the three raw offline collections (guardians, students, student_guardians)
 * client-side — there is no dedicated guardian read API yet, only the generic
 * collection bridge, so this is done here instead of fabricating a backend. */
export function buildGuardianRows(
  guardianRecords: SchoolAdminRecord[],
  studentRecords: SchoolAdminRecord[],
  linkRecords: SchoolAdminRecord[],
): GuardianRow[] {
  const studentsById = new Map<string, StudentLite>();
  for (const s of studentRecords) {
    const id = str(s.id);
    if (!id) continue;
    studentsById.set(id, {
      id,
      firstName: str(s.firstName),
      lastName: str(s.lastName),
      admissionNumber: str(s.admissionNumber),
      gradeLevel: strOrNull(s.gradeLevel),
      isActive: bool(s.isActive),
    });
  }

  const childrenByGuardian = new Map<string, StudentLite[]>();
  const primaryByGuardian = new Set<string>();
  for (const link of linkRecords) {
    const guardianId = str(link.guardianId);
    const studentId = str(link.studentId);
    const student = studentsById.get(studentId);
    if (!guardianId || !student) continue;
    const list = childrenByGuardian.get(guardianId) ?? [];
    list.push(student);
    childrenByGuardian.set(guardianId, list);
    if (bool(link.isPrimary)) primaryByGuardian.add(guardianId);
  }

  return guardianRecords
    .map((g) => {
      const id = str(g.id);
      return {
        id,
        firstName: str(g.firstName),
        lastName: str(g.lastName),
        relationship: str(g.relationship) || 'Other',
        phoneNumber: str(g.phoneNumber),
        email: strOrNull(g.email),
        address: strOrNull(g.address),
        occupation: strOrNull(g.occupation),
        isEmergencyContact: bool(g.isEmergencyContact),
        updatedAt: str(g.updatedAt),
        children: childrenByGuardian.get(id) ?? [],
        isPrimaryContact: primaryByGuardian.has(id),
      };
    })
    .filter((g) => g.id);
}
