import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

export function registerTeacherDashboardHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.TEACHER_GET_DASHBOARD, assertNoArgs, async () => (await app.teachers.dashboard()).data);
}
