import type {
  AcademicsApplicationService,
  StudentApplicationService,
  TeacherApplicationService,
  TimetableApplicationService,
} from '@nemis-desktop/application';
import { schoolAdminBridge } from '@/services/nemis-bridge/school-admin';
import { group, query } from './core';

/** ApplicationLayer groups the Institution Admin (school admin) portal owns:
 * dashboard/school-statistics reporting, school profile, academic
 * foundation, students, timetable authoring, and staff-directory management
 * (the `teachers` service's admin methods — its `dashboard` method is a
 * teacher-owned addition, merged in by lib/ipc/index.ts). */
export const schoolAdminIpc = {
  reporting: group('reporting', {
    getDashboardOverview: () => query(() => schoolAdminBridge.getDashboardOverview()),
    getStudentStatistics: () => query(() => schoolAdminBridge.getStudentStatistics()),
  }),
  institution: group('institution', {
    getCurrentSchool: () => query(() => schoolAdminBridge.getSchoolSummary()),
    listInstitutions: () => query(() => schoolAdminBridge.listInstitutions()),
  }),
  academics: group<AcademicsApplicationService>('academics', {
    enroll: (dto) => query(() => schoolAdminBridge.enrollStudent(dto)),
    moveEnrollmentClass: (dto) => query(() => schoolAdminBridge.moveEnrollmentClass(dto)),
    getCurrentAcademicYear: () => query(() => schoolAdminBridge.getCurrentAcademicYear()),
    listAcademicYears: () => query(() => schoolAdminBridge.listAcademicYears()),
    createAcademicYear: (dto) =>
      query(() =>
        schoolAdminBridge.createAcademicYear({
          code: dto.code,
          startDate: dto.startDate,
          endDate: dto.endDate,
          makeCurrent: dto.makeCurrent,
        }),
      ),
    updateAcademicYear: (dto) =>
      query(() =>
        schoolAdminBridge.updateAcademicYear({
          id: dto.id,
          code: dto.code,
          startDate: dto.startDate,
          endDate: dto.endDate,
        }),
      ),
    setCurrentAcademicYear: (dto) => query(() => schoolAdminBridge.setCurrentAcademicYear(dto.id)),
    setAcademicYearStatus: (dto) =>
      query(() => schoolAdminBridge.setAcademicYearStatus({ id: dto.id, status: dto.status })),
    listTerms: (dto) => query(() => schoolAdminBridge.listTerms(dto.academicYearId)),
    getCurrentTerm: () => query(() => schoolAdminBridge.getCurrentTerm()),
    createTerm: (dto) =>
      query(() =>
        schoolAdminBridge.createTerm({
          academicYearId: dto.academicYearId,
          name: dto.name,
          startDate: dto.startDate,
          endDate: dto.endDate,
          makeCurrent: dto.makeCurrent,
        }),
      ),
    updateTerm: (dto) =>
      query(() =>
        schoolAdminBridge.updateTerm({
          id: dto.id,
          name: dto.name,
          startDate: dto.startDate,
          endDate: dto.endDate,
        }),
      ),
    setCurrentTerm: (dto) => query(() => schoolAdminBridge.setCurrentTerm(dto.id)),
    deleteTerm: (dto) => query(() => schoolAdminBridge.deleteTerm(dto.id)),
    listClasses: (dto) =>
      query(() =>
        schoolAdminBridge.listClasses({
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
        schoolAdminBridge.createClass({
          academicYearId: dto.academicYearId,
          name: dto.name,
          section: dto.section,
          gradeLevel: dto.gradeLevel,
          capacity: dto.capacity,
        }),
      ),
    updateClass: (dto) =>
      query(() =>
        schoolAdminBridge.updateClass({
          id: dto.id,
          name: dto.name,
          section: dto.section,
          gradeLevel: dto.gradeLevel,
          capacity: dto.capacity,
        }),
      ),
    setClassActive: (dto) =>
      query(() => schoolAdminBridge.setClassActive({ id: dto.id, isActive: dto.isActive })),
    getGradeLevelCounts: () => query(() => schoolAdminBridge.getGradeLevelCounts()),
    listSubjects: (dto) =>
      query(() =>
        schoolAdminBridge.listSubjects({
          limit: dto.limit,
          offset: dto.offset,
          keyword: dto.keyword,
          includeInactive: dto.includeInactive,
          sort: dto.sort,
        }),
      ),
    createSubject: (dto) =>
      query(() =>
        schoolAdminBridge.createSubject({ name: dto.name, code: dto.code, description: dto.description }),
      ),
    updateSubject: (dto) =>
      query(() =>
        schoolAdminBridge.updateSubject({
          id: dto.id,
          name: dto.name,
          code: dto.code,
          description: dto.description,
        }),
      ),
    setSubjectActive: (dto) =>
      query(() => schoolAdminBridge.setSubjectActive({ id: dto.id, isActive: dto.isActive })),
    listClassSubjects: (dto) => query(() => schoolAdminBridge.listClassSubjects(dto.classId)),
    assignSubjectToClass: (dto) =>
      query(() =>
        schoolAdminBridge.assignSubjectToClass({ classId: dto.classId, subjectId: dto.subjectId }),
      ),
    unassignSubjectFromClass: (dto) =>
      query(() =>
        schoolAdminBridge.unassignSubjectFromClass({ classId: dto.classId, subjectId: dto.subjectId }),
      ),
  }),
  students: group<StudentApplicationService>('students', {
    list: (dto) => query(() => schoolAdminBridge.listStudents(dto)),
    getById: (dto) => query(() => schoolAdminBridge.getStudent(dto.studentId)),
    create: (dto) => query(() => schoolAdminBridge.createStudent(dto)),
    update: (dto) => query(() => schoolAdminBridge.updateStudent(dto)),
    setActive: (dto) => query(() => schoolAdminBridge.setStudentActive(dto)),
    deactivate: (dto) =>
      query(() => schoolAdminBridge.setStudentActive({ studentId: dto.studentId, isActive: false })),
    createGuardian: (dto) => query(() => schoolAdminBridge.createStudentGuardian(dto)),
    listEnrollments: (id) => query(() => schoolAdminBridge.listStudentEnrollments(id)),
  }),
  /** Staff-directory management only — `teachers.dashboard` is merged in by
   * lib/ipc/index.ts from the teacher-owned lib/ipc/teacher.ts. Left
   * unwrapped (no group()) here so index.ts can combine both halves before
   * wrapping the whole `teachers` service once. */
  teachersAdmin: {
    list: (dto: Parameters<TeacherApplicationService['list']>[0]) =>
      query(() => schoolAdminBridge.listTeachers(dto)),
    getProfile: (id: Parameters<TeacherApplicationService['getProfile']>[0]) =>
      query(() => schoolAdminBridge.getTeacherProfile(id)),
    create: (dto: Parameters<TeacherApplicationService['create']>[0]) =>
      query(() => schoolAdminBridge.createTeacher(dto)),
    update: (dto: Parameters<TeacherApplicationService['update']>[0]) =>
      query(() => schoolAdminBridge.updateTeacher(dto)),
    setActive: (dto: Parameters<TeacherApplicationService['setActive']>[0]) =>
      query(() => schoolAdminBridge.setTeacherActive(dto)),
    getAssignments: (id: Parameters<TeacherApplicationService['getAssignments']>[0]) =>
      query(() => schoolAdminBridge.listTeachingAssignments(id)),
    assign: (dto: Parameters<TeacherApplicationService['assign']>[0]) =>
      query(() => schoolAdminBridge.assignTeacher(dto)),
    updateAssignment: (dto: Parameters<TeacherApplicationService['updateAssignment']>[0]) =>
      query(() => schoolAdminBridge.updateTeachingAssignment(dto)),
    removeAssignment: (dto: Parameters<TeacherApplicationService['removeAssignment']>[0]) =>
      query(() => schoolAdminBridge.removeTeachingAssignment(dto)),
  },
  timetables: group<TimetableApplicationService>('timetables', {
    list: (dto) => query(() => schoolAdminBridge.listTimetables(dto)),
    getClassSchedule: (id) => query(() => schoolAdminBridge.getClassSchedule(id)),
    getTeacherSchedule: (id) => query(() => schoolAdminBridge.getTeacherSchedule(id)),
    getSubjectSchedule: (id) => query(() => schoolAdminBridge.getSubjectSchedule(id)),
    create: (dto) => query(() => schoolAdminBridge.createTimetableEntry(dto)),
    update: (dto) => query(() => schoolAdminBridge.updateTimetableEntry(dto)),
    delete: (id) => query(() => schoolAdminBridge.deleteTimetableEntry(id)),
    copy: (dto) => query(() => schoolAdminBridge.copyTimetable(dto)),
    validate: (dto) => query(() => schoolAdminBridge.validateTimetable(dto)),
    detectConflicts: (dto) => query(() => schoolAdminBridge.detectTimetableConflicts(dto ?? {})),
    periods: (id) => query(() => schoolAdminBridge.getTimetablePeriods(id)),
    dashboard: (day) => query(() => schoolAdminBridge.getTimetableDashboard(day)),
  }),
};
