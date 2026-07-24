const BASE = '/government/school-admin';

const TITLES: Readonly<Record<string, string>> = {
  [BASE]: 'Dashboard Overview',
  [`${BASE}/students`]: 'Students',
  [`${BASE}/teachers-staff`]: 'Teachers & Staff',
  [`${BASE}/parents-guardians`]: 'Parents & Guardians',
  [`${BASE}/classes`]: 'Classes Management',
  [`${BASE}/academic-years`]: 'Academic Years',
  [`${BASE}/terms`]: 'Terms',
  [`${BASE}/grade-levels`]: 'Grade Levels',
  [`${BASE}/subjects`]: 'Subjects Management',
  [`${BASE}/attendance`]: 'Attendance Management',
  [`${BASE}/academic-grading`]: 'Academic & Grading',
  [`${BASE}/academic-grading/windows`]: 'Grade Windows',
  [`${BASE}/timetable`]: 'General Schedule Management',
  [`${BASE}/financial`]: 'Financial / Fees',
  [`${BASE}/financial/record-payment`]: 'Record Payment',
  [`${BASE}/reports`]: 'Reports',
  [`${BASE}/notifications`]: 'Notifications',
  [`${BASE}/messages`]: 'Messages',
  [`${BASE}/settings`]: 'School Settings',
  [`${BASE}/school-profile`]: 'School Profile',
};

const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function resolvePageTitle(pathname: string): { title: string; segments: string[] } {
  const title = TITLES[pathname] ?? 'School Admin';
  const segments = pathname.replace(BASE, '').split('/').filter(Boolean).map(titleCase);
  return { title, segments: ['School Admin', ...segments] };
}
