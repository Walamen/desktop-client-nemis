import type { SessionState } from '../stores/session-store';

export function selectCurrentUserId(state: SessionState): string | null {
  return state.currentUserId;
}
export function selectSelectedStudentId(state: SessionState): string | null {
  return state.selectedStudentId;
}
export function selectActiveAcademicYearId(state: SessionState): string | null {
  return state.activeAcademicYearId;
}
export function selectCurrentDeviceId(state: SessionState): string | null {
  return state.currentDeviceId;
}
