export interface DashboardOverviewOutput {
  totalStudents: number;
  totalClasses: number;
  attendanceToday: { present: number; total: number };
}
