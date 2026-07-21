import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertListSubjectsArgs,
  assertCreateSubjectArgs,
  assertUpdateSubjectArgs,
  assertSetActiveArgs,
} from '@app/security/validateIpc';

export function registerSubjectHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.SUBJECT_LIST, assertListSubjectsArgs, async (request) => {
    const res = await app.academics.listSubjects(request);
    return res.data;
  });

  handle(IpcChannels.SUBJECT_CREATE, assertCreateSubjectArgs, async (request) => {
    const res = await app.academics.createSubject(request);
    return res.data;
  });

  handle(IpcChannels.SUBJECT_UPDATE, assertUpdateSubjectArgs, async (request) => {
    const res = await app.academics.updateSubject(request);
    return res.data;
  });

  handle(IpcChannels.SUBJECT_SET_ACTIVE, assertSetActiveArgs, async (request) => {
    const res = await app.academics.setSubjectActive(request);
    return res.data;
  });
}
