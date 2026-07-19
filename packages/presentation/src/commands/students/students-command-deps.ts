import type { StudentApplicationService } from '@nemis-desktop/application';
import type { NotificationStore } from '../../stores/notification-store';

export interface StudentsCommandDeps {
  readonly students: StudentApplicationService;
  readonly notifications: NotificationStore;
}
