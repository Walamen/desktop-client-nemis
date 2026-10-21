/** Desktop copy of the server's audit labels (Nemis apps/Server/src/audit/
 * utils/action-mapper.ts + county-audit-scope.ts entityLabel), so labels and
 * search match the web. Keep the two in step. */
export const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  LOGIN: 'Logged In',
  LOGOUT: 'Logged Out',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  EXPORT: 'Exported',
  IMPORT: 'Imported',
  SEARCH: 'Searched',
};

const ENTITY_LABELS: Record<string, string> = {
  institutions: 'Institution',
  users: 'User',
  students: 'Student',
  staff: 'Staff',
  teachers: 'Teacher',
  classes: 'Class',
  subjects: 'Subject',
  grades: 'Grade',
  attendance: 'Attendance',
  enrollments: 'Enrollment',
  fees: 'Fee Structure',
  reports: 'Report',
  announcements: 'Announcement',
  notifications: 'Notification',
  counties: 'County',
  districts: 'District',
  schools: 'School',
  'academic-years': 'Academic Year',
  terms: 'Term',
  timetables: 'Timetable',
  messages: 'Message',
  guardians: 'Guardian',
  'student-requests': 'Student Request',
  inspections: 'Inspection',
  reviews: 'Review',
  'access-requests': 'Access Request',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** Mapped label, else the type humanised: feeRule → "Fee Rule", StudentTransfer → "Student Transfer". */
export function entityLabel(entityType: string): string {
  const mapped = ENTITY_LABELS[entityType];
  if (mapped) return mapped;
  return entityType
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
