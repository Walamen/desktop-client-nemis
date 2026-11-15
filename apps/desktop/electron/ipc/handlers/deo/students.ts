import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

/** DEO Students & Enrollment, from this device. The district comes from the
 * signed-in workspace, never from the renderer. */
export function registerDeoStudentHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.DEO_LIST_STUDENTS, assertNoArgs, async () => (await app.deo.listStudents()).data);
}
