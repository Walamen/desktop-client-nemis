/** Below this school attendance rate (%) a DEO dropout alert is raised, and
 * below this share of attended records a pupil is at risk. */
export const LOW_ATTENDANCE_RATE = 80;

/** Fewer records than this in the 30-day window and a pupil is not judged. */
export const MIN_RECORDS_TO_JUDGE = 5;

// The at-risk test is `records >= MIN_RECORDS_TO_JUDGE && attended * 100 <
// LOW_ATTENDANCE_RATE * records`, exact (never a rounded rate), LATE
// attending. The SQLite read model applies it in SQL
// (countAtRiskStudentsBySchool); the server keeps the same rule in
// Nemis apps/Server/src/common/district/pupil-risk.ts.
