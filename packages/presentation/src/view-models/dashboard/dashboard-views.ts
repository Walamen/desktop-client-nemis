/** A single dashboard statistic. `placeholder: true` means the value is NOT
 * backed by a real application use case yet (Phase 7 has no summary queries
 * beyond the student count). The UI marks placeholder tiles visibly. */
export interface DashboardStat {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly placeholder: boolean;
}

export interface DashboardSummaryView {
  /** Real: from listStudents PagedResult.total. */
  readonly totalStudents: number;
  /** All tiles for the stat grid (totalStudents is real, the rest placeholder). */
  readonly stats: readonly DashboardStat[];
}
