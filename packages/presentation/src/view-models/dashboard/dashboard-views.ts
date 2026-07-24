/** A real dashboard statistic — every value is backed by a repository count.
 * There are no placeholder/sample tiles: unbacked facts (teachers) are their
 * own empty state in the UI, never a fabricated number here. */
export interface DashboardStatView {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

export interface DashboardSummaryView {
  readonly stats: readonly DashboardStatView[];
  readonly attendanceToday: { readonly present: number; readonly total: number };
  readonly studentsByGrade: readonly { readonly gradeLevel: string; readonly studentCount: number }[];
  readonly recentlyEnrolled: readonly { readonly id: string; readonly fullName: string; readonly admissionNumber: string }[];
}
