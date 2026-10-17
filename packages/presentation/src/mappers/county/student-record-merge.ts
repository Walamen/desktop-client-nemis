import type {
  CountyStudentDetail,
  StudentAcademicRecord,
  StudentTransferRecord,
  StudentYearRecord,
} from '@nemis-desktop/types';

/** The Academic record and Transfers tabs: this device's rows plus, when the
 * server answered, the child's years and transfers elsewhere
 * (spec §5.5). A year is one (academic year, school); the local row wins and
 * its blank average/outcome is filled from the server's. A year at a school
 * this device does not hold is "Other county". Only ever merges into the
 * student whose id is in the URL. */
export function mergeStudentRecord(
  studentId: string,
  local: CountyStudentDetail,
  remote: StudentAcademicRecord | null,
  localInstitutionIds: ReadonlySet<string>,
): { years: StudentYearRecord[]; transfers: StudentTransferRecord[] } {
  if (remote === null || local.student.id !== studentId) {
    return { years: local.years, transfers: local.transfers };
  }
  const years = new Map<string, StudentYearRecord>();
  for (const row of local.years) years.set(`${row.academicYearId}|${row.institutionId}`, row);
  for (const r of remote.years) {
    const key = `${r.academicYearId}|${r.institutionId}`;
    const mine = years.get(key);
    if (mine) {
      years.set(key, { ...mine, average: mine.average ?? r.average, outcome: mine.outcome ?? r.outcome });
      continue;
    }
    years.set(key, {
      academicYearId: r.academicYearId,
      academicYearName: r.academicYearName,
      academicYearStartDate: r.academicYearStartDate,
      isCurrentYear: r.isCurrentYear,
      institutionId: r.institutionId,
      institutionName: r.institutionName,
      className: r.className,
      gradeLevel: r.gradeLevel,
      outcome: r.outcome,
      average: r.average,
      attendanceRate: null,
      otherCounty: !localInstitutionIds.has(r.institutionId),
    });
  }
  const transfers = new Map<string, StudentTransferRecord>();
  for (const t of remote.transfers) transfers.set(t.id, t);
  for (const t of local.transfers) transfers.set(t.id, t);
  return {
    years: [...years.values()].sort((a, b) =>
      (b.academicYearStartDate ?? '').localeCompare(a.academicYearStartDate ?? ''),
    ),
    transfers: [...transfers.values()].sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/** Outcome column: the recorded outcome, else In progress (current year) or Not recorded. */
export function outcomeLabel(row: StudentYearRecord): string {
  switch (row.outcome) {
    case 'PROMOTED':
      return 'Promoted';
    case 'RETAINED':
      return 'Retained';
    case 'GRADUATED':
      return 'Graduated';
    default:
      return row.isCurrentYear ? 'In progress' : 'Not recorded';
  }
}
