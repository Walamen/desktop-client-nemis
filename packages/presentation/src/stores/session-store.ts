import { createStore } from 'zustand/vanilla';

/** Cross-screen selection/session state so every screen agrees on what is
 * selected. Screen-specific state stays in each ViewModel's store. */
export interface SessionState {
  readonly currentUserId: string | null;
  readonly selectedStudentId: string | null;
  readonly selectedSchoolId: string | null;
  readonly activeAcademicYearId: string | null;
  readonly activeTermId: string | null;
  readonly currentDeviceId: string | null;
}

export class SessionStore {
  readonly store = createStore<SessionState>(() => ({
    currentUserId: null,
    selectedStudentId: null,
    selectedSchoolId: null,
    activeAcademicYearId: null,
    activeTermId: null,
    currentDeviceId: null,
  }));

  setCurrentUser(currentUserId: string | null): void {
    this.store.setState({ currentUserId });
  }
  selectStudent(selectedStudentId: string | null): void {
    this.store.setState({ selectedStudentId });
  }
  selectSchool(selectedSchoolId: string | null): void {
    this.store.setState({ selectedSchoolId });
  }
  setActiveAcademicYear(activeAcademicYearId: string | null, activeTermId?: string | null): void {
    this.store.setState({ activeAcademicYearId, activeTermId: activeTermId ?? null });
  }
  setCurrentDevice(currentDeviceId: string | null): void {
    this.store.setState({ currentDeviceId });
  }
}
