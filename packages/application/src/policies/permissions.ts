import type { PermissionRequest } from '../interfaces/permission-evaluator';

/** Canonical action strings the (advisory) permission evaluator understands.
 * Authorization is backend-authoritative; these support coarse local checks. */
export const APPLICATION_ACTIONS = {
  STUDENTS_CREATE: 'students:create',
  STUDENTS_DEACTIVATE: 'students:deactivate',
  ACADEMICS_ENROLL: 'academics:enroll',
  ATTENDANCE_RECORD: 'attendance:record',
  ASSESSMENTS_PUBLISH_GRADE: 'assessments:publishGrade',
  INSTITUTION_UPDATE_GRADING: 'institution:updateGradingConfig',
} as const;

export type ApplicationAction = (typeof APPLICATION_ACTIONS)[keyof typeof APPLICATION_ACTIONS];

export function permission(
  action: ApplicationAction,
  opts?: { resource?: string; actorId?: string },
): PermissionRequest {
  const request: { action: string; resource?: string; actorId?: string } = { action };
  if (opts?.resource !== undefined) request.resource = opts.resource;
  if (opts?.actorId !== undefined) request.actorId = opts.actorId;
  return request;
}
