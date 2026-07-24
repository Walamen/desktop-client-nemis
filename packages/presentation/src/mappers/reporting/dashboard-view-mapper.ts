import type { DashboardOverviewOutput } from '@nemis-desktop/application';
import type { DashboardSummaryView } from '../../view-models/dashboard/dashboard-views';

export function toDashboardSummaryView(dto: DashboardOverviewOutput): DashboardSummaryView {
  return {
    stats: [
      { key: 'total-students', label: 'Total Students', value: dto.totalStudents },
      { key: 'total-classes', label: 'Total Classes', value: dto.totalClasses },
      { key: 'total-subjects', label: 'Total Subjects', value: dto.totalSubjects },
    ],
    attendanceToday: dto.attendanceToday,
    studentsByGrade: dto.studentsByGrade,
    recentlyEnrolled: dto.recentlyEnrolled.map(({ id, fullName, admissionNumber }) => ({ id, fullName, admissionNumber })),
  };
}
