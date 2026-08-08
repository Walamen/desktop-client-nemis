import type { ApplicationLayer } from '@nemis-desktop/application';
import type { NotificationKind } from '../notifications/notification';
import { AcademicYearViewModel } from '../view-models/academic-year/academic-year-view-model';
import { AcademicFoundationViewModel } from '../view-models/academic-foundation/academic-foundation-view-model';
import { BootstrapStore } from '../stores/bootstrap-store';
import { BootstrapService } from '../services/bootstrap-service';
import { ConnectivityStore } from '../stores/connectivity-store';
import { DialogStore } from '../stores/dialog-store';
import { NavigationStore } from '../stores/navigation-store';
import { NotificationStore } from '../stores/notification-store';
import { SessionStore } from '../stores/session-store';
import { AssessmentsViewModel } from '../view-models/assessments/assessments-view-model';
import { AssignmentsViewModel } from '../view-models/assignments/assignments-view-model';
import { AttendanceViewModel } from '../view-models/attendance/attendance-view-model';
import { ClassRosterViewModel } from '../view-models/class-roster/class-roster-view-model';
import { CurrentUserViewModel } from '../view-models/current-user/current-user-view-model';
import { DashboardViewModel } from '../view-models/dashboard/dashboard-view-model';
import { DeviceViewModel } from '../view-models/device/device-view-model';
import { SchoolsViewModel } from '../view-models/institution/schools-view-model';
import { SettingsViewModel } from '../view-models/settings/settings-view-model';
import { StudentsViewModel } from '../view-models/students/students-view-model';
import { StudentStatisticsViewModel } from '../view-models/students/student-statistics-view-model';
import {
  EnrollmentViewModel,
  StudentProfileViewModel,
  StudentSearchViewModel,
  StudentsListViewModel,
} from '../view-models/students/focused-student-view-models';
import { SyncViewModel } from '../view-models/sync/sync-view-model';
import { TeacherDashboardViewModel, TeacherProfileViewModel, TeacherSearchViewModel, TeachersListViewModel, TeachersViewModel, TeachingAssignmentViewModel } from '../view-models/teachers/teachers-view-model';
import { ClassScheduleViewModel, ConflictViewModel, SubjectScheduleViewModel, TeacherScheduleViewModel, TimetableDashboardViewModel, TimetableViewModel } from '../view-models/timetables/timetable-view-model';

export interface PresentationStores {
  readonly notifications: NotificationStore;
  readonly connectivity: ConnectivityStore;
  readonly session: SessionStore;
  readonly dialogs: DialogStore;
  readonly navigation: NavigationStore;
  readonly bootstrap: BootstrapStore;
}

export interface PresentationViewModels {
  readonly students: StudentsViewModel;
  readonly studentsList: StudentsListViewModel;
  readonly studentProfile: StudentProfileViewModel;
  readonly enrollment: EnrollmentViewModel;
  readonly studentSearch: StudentSearchViewModel;
  readonly classRoster: ClassRosterViewModel;
  readonly attendance: AttendanceViewModel;
  readonly assessments: AssessmentsViewModel;
  readonly assignments: AssignmentsViewModel;
  readonly settings: SettingsViewModel;
  readonly schools: SchoolsViewModel;
  readonly device: DeviceViewModel;
  readonly currentUser: CurrentUserViewModel;
  readonly dashboard: DashboardViewModel;
  readonly studentStatistics: StudentStatisticsViewModel;
  readonly teachers: TeachersViewModel;
  readonly teachersList: TeachersListViewModel;
  readonly teacherProfile: TeacherProfileViewModel;
  readonly teacherSearch: TeacherSearchViewModel;
  readonly teachingAssignments: TeachingAssignmentViewModel;
  readonly teacherDashboard: TeacherDashboardViewModel;
  readonly sync: SyncViewModel;
  readonly academicYear: AcademicYearViewModel;
  readonly academicFoundation: AcademicFoundationViewModel;
  readonly timetable: TimetableViewModel;
  readonly teacherSchedule: TeacherScheduleViewModel;
  readonly classSchedule: ClassScheduleViewModel;
  readonly subjectSchedule: SubjectScheduleViewModel;
  readonly timetableConflicts: ConflictViewModel;
  readonly timetableDashboard: TimetableDashboardViewModel;
}

export interface PresentationLayer {
  readonly stores: PresentationStores;
  readonly viewModels: PresentationViewModels;
  readonly bootstrap: BootstrapService;
}

export interface PresentationLayerOptions {
  readonly autoDismissOverrides?: Partial<Record<NotificationKind, number | null>>;
}

/** Composition root: the renderer (Phase 7) calls this once with the
 * application layer (later an IPC-backed structural equivalent) and binds
 * React to the returned stores and ViewModels. */
export function createPresentationLayer(
  app: ApplicationLayer,
  options?: PresentationLayerOptions,
): PresentationLayer {
  const notifications = new NotificationStore(options?.autoDismissOverrides);
  const connectivity = new ConnectivityStore(notifications);
  const session = new SessionStore();
  const dialogs = new DialogStore();
  const navigation = new NavigationStore();
  const bootstrap = new BootstrapStore();

  const students = new StudentsViewModel({
    students: app.students,
    academics: app.academics,
    notifications,
    session,
  });
  const teachers = new TeachersViewModel({ teachers: app.teachers, notifications });
  const timetable = new TimetableViewModel({ timetables: app.timetables, notifications });
  const viewModels: PresentationViewModels = {
    students,
    studentsList: new StudentsListViewModel(students),
    studentProfile: new StudentProfileViewModel(students),
    enrollment: new EnrollmentViewModel(students),
    studentSearch: new StudentSearchViewModel(students),
    classRoster: new ClassRosterViewModel({ academics: app.academics, notifications }),
    attendance: new AttendanceViewModel({ attendance: app.attendance, notifications }),
    assessments: new AssessmentsViewModel({ assessments: app.assessments, notifications }),
    assignments: new AssignmentsViewModel({ assignments: app.assignments, notifications }),
    settings: new SettingsViewModel({
      institution: app.institution,
      infra: app.infra,
      notifications,
    }),
    schools: new SchoolsViewModel({ institution: app.institution }),
    device: new DeviceViewModel({ infra: app.infra, notifications, session }),
    currentUser: new CurrentUserViewModel({ identity: app.identity, session }),
    dashboard: new DashboardViewModel({ reporting: app.reporting, notifications }),
    studentStatistics: new StudentStatisticsViewModel({ reporting: app.reporting, notifications }),
    teachers,
    teachersList: new TeachersListViewModel(teachers),
    teacherProfile: new TeacherProfileViewModel(teachers),
    teacherSearch: new TeacherSearchViewModel(teachers),
    teachingAssignments: new TeachingAssignmentViewModel(teachers),
    teacherDashboard: new TeacherDashboardViewModel(teachers),
    sync: new SyncViewModel(connectivity),
    academicYear: new AcademicYearViewModel({ academics: app.academics }),
    academicFoundation: new AcademicFoundationViewModel({
      academics: app.academics,
      notifications,
    }),
    timetable,
    teacherSchedule: new TeacherScheduleViewModel(timetable),
    classSchedule: new ClassScheduleViewModel(timetable),
    subjectSchedule: new SubjectScheduleViewModel(timetable),
    timetableConflicts: new ConflictViewModel(timetable),
    timetableDashboard: new TimetableDashboardViewModel(timetable),
  };

  const bootstrapService = new BootstrapService(bootstrap, [
    {
      name: 'device',
      run: () => viewModels.device.loadDeviceInfo(),
      hasError: () => viewModels.device.store.getState().device.status === 'error',
    },
    {
      name: 'user',
      run: () => viewModels.currentUser.loadCurrentUser(),
      hasError: () => viewModels.currentUser.store.getState().user.status === 'error',
    },
    {
      name: 'school',
      run: () => viewModels.settings.loadCurrentSchool(),
      hasError: () => viewModels.settings.store.getState().profile.status === 'error',
    },
    {
      name: 'academic-year',
      run: () => viewModels.academicYear.loadCurrent(),
      hasError: () => viewModels.academicYear.store.getState().current.status === 'error',
    },
    {
      name: 'current-term',
      run: () => viewModels.academicFoundation.loadCurrentTerm(),
      hasError: () => viewModels.academicFoundation.store.getState().currentTerm.status === 'error',
    },
    {
      name: 'dashboard',
      run: () => viewModels.dashboard.loadOverview(),
      hasError: () => viewModels.dashboard.store.getState().summary.status === 'error',
    },
  ]);

  return {
    stores: { notifications, connectivity, session, dialogs, navigation, bootstrap },
    viewModels,
    bootstrap: bootstrapService,
  };
}
