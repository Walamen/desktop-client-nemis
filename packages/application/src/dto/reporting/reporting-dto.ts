export interface DashboardOverviewOutput {
  totalStudents: number;
  totalClasses: number;
  totalSubjects: number;
  attendanceToday: { present: number; total: number };
}
