import { hasData, toViewStatus, type ViewStatus } from '../core/async-state';
import { matchesKeyword } from '../search/search-state';
import type { ConnectivityState } from '../stores/connectivity-store';
import type { SessionState } from '../stores/session-store';
import type { StudentsState } from '../view-models/students/students-view-model';
import type { StudentRowView } from '../view-models/students/students-views';

/** Rows for the students table with the client-side keyword filter applied. */
export function selectStudentRows(state: StudentsState): readonly StudentRowView[] {
  if (!hasData(state.list)) return [];
  return state.list.data.filter((row) =>
    matchesKeyword([row.fullName, row.admissionNumber], state.search.keyword),
  );
}

export function selectStudentsViewStatus(
  state: StudentsState,
  connectivity: ConnectivityState,
): ViewStatus {
  return toViewStatus(state.list, {
    isOffline: !connectivity.isOnline,
    isSyncing: connectivity.syncStatus === 'syncing',
  });
}

export function selectSelectedStudent(
  session: SessionState,
  students: StudentsState,
): StudentRowView | null {
  if (!session.selectedStudentId || !hasData(students.list)) return null;
  return students.list.data.find((row) => row.id === session.selectedStudentId) ?? null;
}
