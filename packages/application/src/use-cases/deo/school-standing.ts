/**
 * The standing of one school as a District Education Officer sees it.
 *
 * One rule, two copies: this one serves the offline desktop, and
 * Nemis/apps/Server/src/common/district/school-standing.ts serves the web.
 * Both are pinned by the same case table; change them together.
 */

import type { SchoolComplianceStatus, SchoolPerformanceStatus } from '@nemis-desktop/types';

export type AlertSeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface SchoolStandingInput {
  /** Attendance records dated in the last 30 days. */
  records30: number;
  /** Of those, PRESENT or LATE. */
  attended30: number;
  /** Whole calendar days since the latest attendance date; null = never. */
  daysSinceAttendance: number | null;
  /** Today falls inside one of the school's terms. */
  termRunning: boolean;
  /** Highest severity among the school's unresolved alerts. */
  worstOpenAlert: AlertSeverityLevel | null;
  activeStudents: number;
  /** Active TEACHER and ASSISTANT_TEACHER staff. */
  teachingStaff: number;
}

export interface SchoolStanding {
  /** Null when nothing was recorded in the window: missing, not zero. */
  attendanceRate: number | null;
  performanceStatus: SchoolPerformanceStatus;
  complianceStatus: SchoolComplianceStatus;
}

const CRITICAL_RATE = 60;
const WARNING_RATE = 80;
const REVIEW_AFTER_DAYS = 3;
const FLAG_AFTER_DAYS = 7;
const MAX_PUPILS_PER_TEACHER = 40;

const SEVERITY_ORDER: readonly AlertSeverityLevel[] = [
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
];

export function schoolStanding(input: SchoolStandingInput): SchoolStanding {
  const attendanceRate =
    input.records30 > 0
      ? Math.round((input.attended30 / input.records30) * 100)
      : null;

  const performanceStatus: SchoolPerformanceStatus =
    attendanceRate === null
      ? 'No Data'
      : attendanceRate < CRITICAL_RATE
        ? 'Critical'
        : attendanceRate < WARNING_RATE
          ? 'Warning'
          : 'Good';

  return {
    attendanceRate,
    performanceStatus,
    complianceStatus: complianceOf(input, attendanceRate),
  };
}

function complianceOf(
  input: SchoolStandingInput,
  attendanceRate: number | null,
): SchoolComplianceStatus {
  const days = input.daysSinceAttendance;
  // Staleness only counts in term time: no school records attendance on vacation.
  const staleFlag = input.termRunning && (days === null || days > FLAG_AFTER_DAYS);
  if (
    (attendanceRate !== null && attendanceRate < CRITICAL_RATE) ||
    staleFlag ||
    input.worstOpenAlert === 'CRITICAL'
  ) {
    return 'Flagged';
  }

  const staleReview =
    input.termRunning && days !== null && days > REVIEW_AFTER_DAYS;
  const overcrowded =
    input.teachingStaff > 0
      ? input.activeStudents / input.teachingStaff > MAX_PUPILS_PER_TEACHER
      : input.activeStudents > 0;
  if (
    (attendanceRate !== null && attendanceRate < WARNING_RATE) ||
    staleReview ||
    input.worstOpenAlert === 'HIGH' ||
    overcrowded
  ) {
    return 'Needs Review';
  }

  return 'Compliant';
}

/** Whole calendar days from a YYYY-MM-DD date to `todayIso` (YYYY-MM-DD). */
export function daysBetween(dateIso: string, todayIso: string): number {
  // UTC midnight on both sides, so a daylight-saving shift cannot move a day.
  const from = Date.parse(`${dateIso.slice(0, 10)}T00:00:00.000Z`);
  const to = Date.parse(`${todayIso.slice(0, 10)}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000);
}

/** Highest of a list of severities; unknown values are ignored. */
export function worstSeverity(
  severities: readonly string[],
): AlertSeverityLevel | null {
  for (const level of SEVERITY_ORDER) {
    if (severities.includes(level)) return level;
  }
  return null;
}
