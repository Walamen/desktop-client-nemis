import type { ApplicationLayer } from '@nemis-desktop/application';
import type { NotificationKind } from '../notifications/notification';
import { ConnectivityStore } from '../stores/connectivity-store';
import { DialogStore } from '../stores/dialog-store';
import { NavigationStore } from '../stores/navigation-store';
import { NotificationStore } from '../stores/notification-store';
import { SessionStore } from '../stores/session-store';
import { AssessmentsViewModel } from '../view-models/assessments/assessments-view-model';
import { AttendanceViewModel } from '../view-models/attendance/attendance-view-model';
import { ClassRosterViewModel } from '../view-models/class-roster/class-roster-view-model';
import { CurrentUserViewModel } from '../view-models/current-user/current-user-view-model';
import { DashboardViewModel } from '../view-models/dashboard/dashboard-view-model';
import { DeviceViewModel } from '../view-models/device/device-view-model';
import { SettingsViewModel } from '../view-models/settings/settings-view-model';
import { StudentsViewModel } from '../view-models/students/students-view-model';
import { SyncViewModel } from '../view-models/sync/sync-view-model';
import { TeachersViewModel } from '../view-models/teachers/teachers-view-model';

export interface PresentationStores {
  readonly notifications: NotificationStore;
  readonly connectivity: ConnectivityStore;
  readonly session: SessionStore;
  readonly dialogs: DialogStore;
  readonly navigation: NavigationStore;
}

export interface PresentationViewModels {
  readonly students: StudentsViewModel;
  readonly classRoster: ClassRosterViewModel;
  readonly attendance: AttendanceViewModel;
  readonly assessments: AssessmentsViewModel;
  readonly settings: SettingsViewModel;
  readonly device: DeviceViewModel;
  readonly currentUser: CurrentUserViewModel;
  readonly dashboard: DashboardViewModel;
  readonly teachers: TeachersViewModel;
  readonly sync: SyncViewModel;
}

export interface PresentationLayer {
  readonly stores: PresentationStores;
  readonly viewModels: PresentationViewModels;
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

  const viewModels: PresentationViewModels = {
    students: new StudentsViewModel({ students: app.students, notifications, session }),
    classRoster: new ClassRosterViewModel({ academics: app.academics, notifications }),
    attendance: new AttendanceViewModel({ attendance: app.attendance, notifications }),
    assessments: new AssessmentsViewModel({ assessments: app.assessments, notifications }),
    settings: new SettingsViewModel({
      institution: app.institution,
      infra: app.infra,
      notifications,
    }),
    device: new DeviceViewModel({ infra: app.infra, notifications, session }),
    currentUser: new CurrentUserViewModel({ identity: app.identity, session }),
    dashboard: new DashboardViewModel({ students: app.students, notifications }),
    teachers: new TeachersViewModel(),
    sync: new SyncViewModel(connectivity),
  };

  return {
    stores: { notifications, connectivity, session, dialogs, navigation },
    viewModels,
  };
}
