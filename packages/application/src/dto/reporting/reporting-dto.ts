export interface DashboardOverviewOutput {
  totalStudents: number;
  totalClasses: number;
  totalSubjects: number;
  attendanceToday: { present: number; total: number };
  studentsByGrade: { gradeLevel: string; studentCount: number }[];
  recentlyEnrolled: { id: string; fullName: string; admissionNumber: string; updatedAt: string }[];
}
