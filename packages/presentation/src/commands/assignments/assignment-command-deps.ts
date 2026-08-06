import type { AssignmentsApplicationService } from '@nemis-desktop/application';
import type { NotificationStore } from '../../stores/notification-store';

export interface AssignmentCommandDeps {
  readonly assignments: AssignmentsApplicationService;
  readonly notifications: NotificationStore;
}
