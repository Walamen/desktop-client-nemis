import type {
  AcademicsApplicationService,
  ApplicationLayer,
  ApplicationResponse,
  AttendanceApplicationService,
  StudentApplicationService,
  TeacherApplicationService,
  TimetableApplicationService,
} from '@nemis-desktop/application';
import {
  DatabaseUnavailableError,
  NetworkUnavailableError,
  NotImplementedPresentationError,
} from '@nemis-desktop/presentation';
import { nemisBridge } from '@/services/nemis-bridge';

/** Parses the `[CODE] message` prefix the preload bridge throws on IpcResult
 * failure. Returns null when the error is not in that shape (e.g. the bridge
 * itself was unavailable, or a non-IPC throw). */
function ipcCodeOf(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const match = /^\[([A-Z_]+)\]/.exec(error.message);
  return match ? match[1]! : null;
}

/** Runs a bridge call and translates transport/DB failures into presentation
 * errors the ViewModels understand. Other coded errors flow through unchanged
 * (toPresentationError degrades them to LoadingError for queries). */
async function callBridge<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const code = ipcCodeOf(error);
    if (code === 'DATABASE_UNAVAILABLE' || code === 'MIGRATION_REQUIRED') {
      throw new DatabaseUnavailableError(
        'The local database is unavailable. Please restart the application.',
        { cause: error },
      );
    }
    if (code === null) {
      throw new NetworkUnavailableError(
        'Lost connection to the local service. Please restart the application.',
        { cause: error },
      );
    }
    throw error;
  }
}

function query<T>(fn: () => Promise<T>): Promise<ApplicationResponse<T>> {
  return callBridge(fn).then((data) => ({ data }));
}

/** Every method not wired to a channel this phase. ComingSoon screens
 * construct their ViewModels with these groups but never invoke them. */
function group<T extends object>(name: string, methods: Partial<T>): T {
  return new Proxy(methods as T, {
    get(target, prop) {
      const value = (target as Record<string | symbol, unknown>)[prop];
      if (value !== undefined) return value;
      return async () => {
        throw new NotImplementedPresentationError(`${name}.${String(prop)}`);
      };
    },
  });
}

/** The renderer's ApplicationLayer-shaped facade over the validated IPC bridge.
 * Dashboard/bootstrap and Academic Foundation methods are live; later modules
 * continue to fail explicitly until their own IPC endpoints are introduced. */
export function createIpcApplicationLayer(): ApplicationLayer {
  const facade = {
    reporting: group('reporting', {
      getDashboardOverview: () => query(() => nemisBridge.getDashboardOverview()),
      getStudentStatistics: () => query(() => nemisBridge.getStudentStatistics()),
    }),
    institution: group('institution', {
      getCurrentSchool: () => query(() => nemisBridge.getSchoolSummary()),
    }),
    identity: group('identity', {
      getCurrentUser: () => query(() => nemisBridge.getCurrentUser()),
    }),
    academics: group<AcademicsApplicationService>('academics', {
      enroll: (dto) => query(() => nemisBridge.enrollStudent(dto)),
      moveEnrollmentClass: (dto) => query(() => nemisBridge.moveEnrollmentClass(dto)),
      getCurrentAcademicYear: () => query(() => nemisBridge.getCurrentAcademicYear()),
      listAcademicYears: () => query(() => nemisBridge.listAcademicYears()),
      createAcademicYear: (dto) =>
        query(() =>
          nemisBridge.createAcademicYear({
            code: dto.code,
            startDate: dto.startDate,
            endDate: dto.endDate,
            makeCurrent: dto.makeCurrent,
          }),
        ),
      updateAcademicYear: (dto) =>
        query(() =>
          nemisBridge.updateAcademicYear({
            id: dto.id,
            code: dto.code,
            startDate: dto.startDate,
            endDate: dto.endDate,
          }),
        ),
      setCurrentAcademicYear: (dto) => query(() => nemisBridge.setCurrentAcademicYear(dto.id)),
      setAcademicYearStatus: (dto) =>
        query(() => nemisBridge.setAcademicYearStatus({ id: dto.id, status: dto.status })),
      listTerms: (dto) => query(() => nemisBridge.listTerms(dto.academicYearId)),
      getCurrentTerm: () => query(() => nemisBridge.getCurrentTerm()),
      createTerm: (dto) =>
        query(() =>
          nemisBridge.createTerm({
            academicYearId: dto.academicYearId,
            name: dto.name,
            startDate: dto.startDate,
            endDate: dto.endDate,
            makeCurrent: dto.makeCurrent,
          }),
        ),
      updateTerm: (dto) =>
        query(() =>
          nemisBridge.updateTerm({
            id: dto.id,
            name: dto.name,
            startDate: dto.startDate,
            endDate: dto.endDate,
          }),
        ),
      setCurrentTerm: (dto) => query(() => nemisBridge.setCurrentTerm(dto.id)),
      deleteTerm: (dto) => query(() => nemisBridge.deleteTerm(dto.id)),
      listClasses: (dto) =>
        query(() =>
          nemisBridge.listClasses({
            limit: dto.limit,
            offset: dto.offset,
            keyword: dto.keyword,
            academicYearId: dto.academicYearId,
            gradeLevel: dto.gradeLevel,
            includeInactive: dto.includeInactive,
            sort: dto.sort,
          }),
        ),
      createClass: (dto) =>
        query(() =>
          nemisBridge.createClass({
            academicYearId: dto.academicYearId,
            name: dto.name,
            section: dto.section,
            gradeLevel: dto.gradeLevel,
            capacity: dto.capacity,
          }),
        ),
      updateClass: (dto) =>
        query(() =>
          nemisBridge.updateClass({
            id: dto.id,
            name: dto.name,
            section: dto.section,
            gradeLevel: dto.gradeLevel,
            capacity: dto.capacity,
          }),
        ),
      setClassActive: (dto) =>
        query(() => nemisBridge.setClassActive({ id: dto.id, isActive: dto.isActive })),
      getGradeLevelCounts: () => query(() => nemisBridge.getGradeLevelCounts()),
      listSubjects: (dto) =>
        query(() =>
          nemisBridge.listSubjects({
            limit: dto.limit,
            offset: dto.offset,
            keyword: dto.keyword,
            includeInactive: dto.includeInactive,
            sort: dto.sort,
          }),
        ),
      createSubject: (dto) =>
        query(() =>
          nemisBridge.createSubject({ name: dto.name, code: dto.code, description: dto.description }),
        ),
      updateSubject: (dto) =>
        query(() =>
          nemisBridge.updateSubject({
            id: dto.id,
            name: dto.name,
            code: dto.code,
            description: dto.description,
          }),
        ),
      setSubjectActive: (dto) =>
        query(() => nemisBridge.setSubjectActive({ id: dto.id, isActive: dto.isActive })),
      listClassSubjects: (dto) => query(() => nemisBridge.listClassSubjects(dto.classId)),
      assignSubjectToClass: (dto) =>
        query(() =>
          nemisBridge.assignSubjectToClass({ classId: dto.classId, subjectId: dto.subjectId }),
        ),
      unassignSubjectFromClass: (dto) =>
        query(() =>
          nemisBridge.unassignSubjectFromClass({ classId: dto.classId, subjectId: dto.subjectId }),
        ),
    }),
    infra: group('infra', {
      getDeviceInfo: () => query(() => nemisBridge.getDeviceInfo()),
    }),
    students: group<StudentApplicationService>('students', {
      list: (dto) => query(() => nemisBridge.listStudents(dto)),
      getById: (dto) => query(() => nemisBridge.getStudent(dto.studentId)),
      create: (dto) => query(() => nemisBridge.createStudent(dto)),
      update: (dto) => query(() => nemisBridge.updateStudent(dto)),
      setActive: (dto) => query(() => nemisBridge.setStudentActive(dto)),
      deactivate: (dto) => query(() => nemisBridge.setStudentActive({ studentId: dto.studentId, isActive: false })),
      createGuardian: (dto) => query(() => nemisBridge.createStudentGuardian(dto)),
      listEnrollments: (id) => query(() => nemisBridge.listStudentEnrollments(id)),
    }),
    teachers: group<TeacherApplicationService>('teachers', {
      list: (dto) => query(() => nemisBridge.listTeachers(dto)),
      getProfile: (id) => query(() => nemisBridge.getTeacherProfile(id)),
      create: (dto) => query(() => nemisBridge.createTeacher(dto)),
      update: (dto) => query(() => nemisBridge.updateTeacher(dto)),
      setActive: (dto) => query(() => nemisBridge.setTeacherActive(dto)),
      getAssignments: (id) => query(() => nemisBridge.listTeachingAssignments(id)),
      assign: (dto) => query(() => nemisBridge.assignTeacher(dto)),
      updateAssignment: (dto) => query(() => nemisBridge.updateTeachingAssignment(dto)),
      removeAssignment: (dto) => query(() => nemisBridge.removeTeachingAssignment(dto)),
      dashboard: () => query(() => nemisBridge.getTeacherDashboard()),
    }),
    timetables: group<TimetableApplicationService>('timetables', {
      list: (dto) => query(() => nemisBridge.listTimetables(dto)),
      getClassSchedule: (id) => query(() => nemisBridge.getClassSchedule(id)),
      getTeacherSchedule: (id) => query(() => nemisBridge.getTeacherSchedule(id)),
      getSubjectSchedule: (id) => query(() => nemisBridge.getSubjectSchedule(id)),
      create: (dto) => query(() => nemisBridge.createTimetableEntry(dto)),
      update: (dto) => query(() => nemisBridge.updateTimetableEntry(dto)),
      delete: (id) => query(() => nemisBridge.deleteTimetableEntry(id)),
      copy: (dto) => query(() => nemisBridge.copyTimetable(dto)),
      validate: (dto) => query(() => nemisBridge.validateTimetable(dto)),
      detectConflicts: (dto) => query(() => nemisBridge.detectTimetableConflicts(dto ?? {})),
      periods: (id) => query(() => nemisBridge.getTimetablePeriods(id)),
      dashboard: (day) => query(() => nemisBridge.getTimetableDashboard(day)),
    }),
    attendance: group<AttendanceApplicationService>('attendance', {
      getByClassAndDate: (dto) => query(() => nemisBridge.listAttendance(dto)),
      record: (dto) => query(() => nemisBridge.recordAttendance(dto)),
    }),
    assessments: group('assessments', {}),
  };
  // Private class fields prevent structural typing; this cast is intentional.
  return facade as unknown as ApplicationLayer;
}
