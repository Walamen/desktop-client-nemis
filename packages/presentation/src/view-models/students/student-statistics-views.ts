/** Real per-institution student counts backing the students list's stat
 * tiles. Every value is a repository count — no placeholder/sample tiles. */
export interface StudentStatisticsView {
  readonly totalStudents: number;
  readonly maleStudents: number;
  readonly femaleStudents: number;
  readonly recentEnrollments: number;
}
