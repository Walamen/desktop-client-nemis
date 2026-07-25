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
  CreateGuardianRequest,
  CreateStudentRequest,
  EnrollStudentRequest,
  EnrollmentResult,
  MoveEnrollmentClassRequest,
  SetStudentActiveRequest,
  StudentListRequest,
  StudentPageResult,
  StudentResult,
  UpdateStudentRequest,
} from '@nemis-desktop/types';
import type {
  CopyTimetableRequest, CreateTimetableEntryRequest, TimetableListRequest,
  UpdateTimetableEntryRequest, ValidateTimetableRequest,
} from '@nemis-desktop/types';
import type {
  AssignTeacherRequest, CreateTeacherRequest, RemoveTeachingAssignmentRequest,
  SetTeacherActiveRequest, TeacherDashboardResult, TeacherListRequest, TeacherPageResult,
  TeacherProfileResult, TeachingAssignmentResult, UpdateTeacherRequest,
  UpdateTeachingAssignmentRequest,
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
  getProvisioningStatus: () => api().auth.getStatus(),
  authenticate: (email: string, password: string) => api().auth.login({ email, password }),
  logout: () => api().auth.logout(),
  startProvisioning: () => api().provisioning.start(),
  getDashboardOverview: (): Promise<DashboardOverviewResult> => api().dashboard.getOverview(),
  getSchoolSummary: (): Promise<SchoolSummaryResult | null> => api().school.getSummary(),
  getCurrentAcademicYear: (): Promise<AcademicYearResult | null> => api().academicYear.getCurrent(),
  getCurrentUser: (): Promise<CurrentUserResult | null> => api().identity.getCurrentUser(),
  getDeviceInfo: (): Promise<DeviceInfoResult | null> => api().device.getInfo(),

  listAcademicYears: (): Promise<AcademicYearListItemResult[]> => api().academicYear.list(),
  createAcademicYear: (request: CreateAcademicYearRequest): Promise<AcademicYearListItemResult> =>
    api().academicYear.create(request),
  updateAcademicYear: (request: UpdateAcademicYearRequest): Promise<AcademicYearListItemResult> =>
    api().academicYear.update(request),
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
  listStudents: (request: StudentListRequest): Promise<StudentPageResult> =>
    api().student.list(request),
  getStudent: (id: string): Promise<StudentResult | null> => api().student.get(id),
  createStudent: (request: CreateStudentRequest): Promise<StudentResult> =>
    api().student.create(request),
  updateStudent: (request: UpdateStudentRequest): Promise<StudentResult> =>
    api().student.update(request),
  setStudentActive: (request: SetStudentActiveRequest): Promise<StudentResult> =>
    api().student.setActive(request),
  createStudentGuardian: (request: CreateGuardianRequest): Promise<StudentResult> =>
    api().student.createGuardian(request),
  enrollStudent: (request: EnrollStudentRequest): Promise<EnrollmentResult> =>
    api().student.enroll(request),
  moveEnrollmentClass: (request: MoveEnrollmentClassRequest): Promise<EnrollmentResult> =>
    api().student.moveClass(request),
  listStudentEnrollments: (id: string): Promise<EnrollmentResult[]> =>
    api().student.listEnrollments(id),
  listTeachers: (request: TeacherListRequest): Promise<TeacherPageResult> => api().teacher.list(request),
  getTeacherProfile: (id: string): Promise<TeacherProfileResult|null> => api().teacher.getProfile(id),
  createTeacher: (request: CreateTeacherRequest): Promise<TeacherProfileResult> => api().teacher.create(request),
  updateTeacher: (request: UpdateTeacherRequest): Promise<TeacherProfileResult> => api().teacher.update(request),
  setTeacherActive: (request: SetTeacherActiveRequest): Promise<TeacherProfileResult> => api().teacher.setActive(request),
  listTeachingAssignments: (id:string):Promise<TeachingAssignmentResult[]> => api().teacher.listAssignments(id),
  assignTeacher: (request:AssignTeacherRequest):Promise<TeachingAssignmentResult> => api().teacher.assign(request),
  updateTeachingAssignment:(request:UpdateTeachingAssignmentRequest):Promise<TeachingAssignmentResult>=>api().teacher.updateAssignment(request),
  removeTeachingAssignment:(request:RemoveTeachingAssignmentRequest):Promise<{id:string}>=>api().teacher.removeAssignment(request),
  getTeacherDashboard:():Promise<TeacherDashboardResult>=>api().teacher.getDashboard(),
  listTimetables: (request:TimetableListRequest) => api().timetable.list(request),
  getClassSchedule: (id:string) => api().timetable.getClassSchedule(id),
  getTeacherSchedule: (id:string) => api().timetable.getTeacherSchedule(id),
  getSubjectSchedule: (id:string) => api().timetable.getSubjectSchedule(id),
  createTimetableEntry: (request:CreateTimetableEntryRequest) => api().timetable.create(request),
  updateTimetableEntry: (request:UpdateTimetableEntryRequest) => api().timetable.update(request),
  deleteTimetableEntry: (id:string) => api().timetable.delete(id),
  copyTimetable: (request:CopyTimetableRequest) => api().timetable.copy(request),
  validateTimetable: (request:ValidateTimetableRequest) => api().timetable.validate(request),
  detectTimetableConflicts: (request:TimetableListRequest) => api().timetable.detectConflicts(request),
  getTimetablePeriods: (classId?:string) => api().timetable.periods(classId),
  getTimetableDashboard: (dayOfWeek:string) => api().timetable.dashboard(dayOfWeek),
};
