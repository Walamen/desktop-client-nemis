import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertNoArgs,
  assertSingleIdArg,
  assertListClassesArgs,
  assertCreateClassArgs,
  assertUpdateClassArgs,
  assertSetActiveArgs,
  assertClassSubjectPairArgs,
} from '@app/security/validateIpc';

export function registerClassHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.CLASS_LIST, assertListClassesArgs, async (request) => {
    const res = await app.academics.listClasses(request);
    return res.data;
  });

  handle(IpcChannels.CLASS_CREATE, assertCreateClassArgs, async (request) => {
    const res = await app.academics.createClass(request);
    return res.data;
  });

  handle(IpcChannels.CLASS_UPDATE, assertUpdateClassArgs, async (request) => {
    const res = await app.academics.updateClass(request);
    return res.data;
  });

  handle(IpcChannels.CLASS_SET_ACTIVE, assertSetActiveArgs, async (request) => {
    const res = await app.academics.setClassActive(request);
    return res.data;
  });

  handle(IpcChannels.CLASS_GRADE_LEVEL_COUNTS, assertNoArgs, async () => {
    const res = await app.academics.getGradeLevelCounts();
    return res.data;
  });

  handle(IpcChannels.CLASS_SUBJECT_LIST, assertSingleIdArg, async (classId) => {
    const res = await app.academics.listClassSubjects({ classId });
    return res.data;
  });

  handle(IpcChannels.CLASS_SUBJECT_ASSIGN, assertClassSubjectPairArgs, async (request) => {
    const res = await app.academics.assignSubjectToClass(request);
    return res.data;
  });

  handle(IpcChannels.CLASS_SUBJECT_UNASSIGN, assertClassSubjectPairArgs, async (request) => {
    const res = await app.academics.unassignSubjectFromClass(request);
    return res.data;
  });
}
