import type { DashboardOverviewOutput } from '@nemis-desktop/application';
import type { DashboardSummaryView } from '../../view-models/dashboard/dashboard-views';

export function toDashboardSummaryView(dto: DashboardOverviewOutput): DashboardSummaryView {
  return {
    stats: [
      { key: 'total-students', label: 'Total Students', value: dto.totalStudents },
      { key: 'total-classes', label: 'Total Classes', value: dto.totalClasses },
    ],
    attendanceToday: dto.attendanceToday,
  };
}
