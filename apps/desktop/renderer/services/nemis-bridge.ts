import type {
  AcademicYearListItemResult,
  AcademicYearResult,
  ClassListRequest,
  ClassResult,
  ClassSubjectPairRequest,
  ClassSubjectResult,
  CreateAcademicYearRequest,
  CreateClassRequest,
  CreateSubjectRequest,
  CreateTermRequest,
  CurrentUserResult,
  DashboardOverviewResult,
  DeletedResult,
  DeviceInfoResult,
  GradeLevelCountResult,
  PagedListResult,
  SchoolSummaryResult,
  SetAcademicYearStatusRequest,
  SetActiveRequest,
  SubjectListRequest,
  SubjectResult,
  TermResult,
  UpdateAcademicYearRequest,
  UpdateClassRequest,
  UpdateSubjectRequest,
  UpdateTermRequest,
} from '@nemis-desktop/types';

function api() {
  if (typeof window === 'undefined' || !window.nemis) {
    throw new Error('Desktop bridge unavailable (running outside Electron).');
  }
  return window.nemis;
}

/** The single renderer-side caller of the dashboard/bootstrap and Academic
 * Foundation IPC channels. Lives in services/ (the only place allowed to
 * touch window.nemis). Returns raw wire results; error translation happens
 * in the ApplicationLayer facade. */
export const nemisBridge = {
  getDashboardOverview: (): Promise<DashboardOverviewResult> => api().dashboard.getOverview(),
  getSchoolSummary: (): Promise<SchoolSummaryResult | null> => api().school.getSummary(),
  getCurrentAcademicYear: (): Promise<AcademicYearResult | null> => api().academicYear.getCurrent(),
  getCurrentUser: (): Promise<CurrentUserResult | null> => api().identity.getCurrentUser(),
  getDeviceInfo: (): Promise<DeviceInfoResult | null> => api().device.getInfo(),

  listAcademicYears: (): Promise<AcademicYearListItemResult[]> => api().academicYear.list(),
  createAcademicYear: (
    request: CreateAcademicYearRequest,
  ): Promise<AcademicYearListItemResult> => api().academicYear.create(request),
  updateAcademicYear: (
    request: UpdateAcademicYearRequest,
  ): Promise<AcademicYearListItemResult> => api().academicYear.update(request),
  setCurrentAcademicYear: (id: string): Promise<AcademicYearListItemResult> =>
    api().academicYear.setCurrent(id),
  setAcademicYearStatus: (
    request: SetAcademicYearStatusRequest,
  ): Promise<AcademicYearListItemResult> => api().academicYear.setStatus(request),

  listTerms: (academicYearId: string): Promise<TermResult[]> => api().term.list(academicYearId),
  getCurrentTerm: (): Promise<TermResult | null> => api().term.getCurrent(),
  createTerm: (request: CreateTermRequest): Promise<TermResult> => api().term.create(request),
  updateTerm: (request: UpdateTermRequest): Promise<TermResult> => api().term.update(request),
  setCurrentTerm: (id: string): Promise<TermResult> => api().term.setCurrent(id),
  deleteTerm: (id: string): Promise<DeletedResult> => api().term.delete(id),

  listClasses: (request: ClassListRequest): Promise<PagedListResult<ClassResult>> =>
    api().classes.list(request),
  createClass: (request: CreateClassRequest): Promise<ClassResult> => api().classes.create(request),
  updateClass: (request: UpdateClassRequest): Promise<ClassResult> => api().classes.update(request),
  setClassActive: (request: SetActiveRequest): Promise<ClassResult> =>
    api().classes.setActive(request),
  getGradeLevelCounts: (): Promise<GradeLevelCountResult[]> => api().classes.gradeLevelCounts(),
  listClassSubjects: (classId: string): Promise<ClassSubjectResult[]> =>
    api().classes.listSubjects(classId),
  assignSubjectToClass: (request: ClassSubjectPairRequest): Promise<ClassSubjectResult> =>
    api().classes.assignSubject(request),
  unassignSubjectFromClass: (request: ClassSubjectPairRequest): Promise<DeletedResult> =>
    api().classes.unassignSubject(request),

  listSubjects: (request: SubjectListRequest): Promise<PagedListResult<SubjectResult>> =>
    api().subject.list(request),
  createSubject: (request: CreateSubjectRequest): Promise<SubjectResult> =>
    api().subject.create(request),
  updateSubject: (request: UpdateSubjectRequest): Promise<SubjectResult> =>
    api().subject.update(request),
  setSubjectActive: (request: SetActiveRequest): Promise<SubjectResult> =>
    api().subject.setActive(request),
};
