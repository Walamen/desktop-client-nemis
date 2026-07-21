import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertNoArgs,
  assertSingleIdArg,
  assertCreateTermArgs,
  assertUpdateTermArgs,
} from '@app/security/validateIpc';

export function registerTermHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.TERM_LIST, assertSingleIdArg, async (academicYearId) => {
    const res = await app.academics.listTerms({ academicYearId });
    return res.data;
  });

  handle(IpcChannels.TERM_GET_CURRENT, assertNoArgs, async () => {
    const res = await app.academics.getCurrentTerm();
    return res.data;
  });

  handle(IpcChannels.TERM_CREATE, assertCreateTermArgs, async (request) => {
    const res = await app.academics.createTerm(request);
    return res.data;
  });

  handle(IpcChannels.TERM_UPDATE, assertUpdateTermArgs, async (request) => {
    const res = await app.academics.updateTerm(request);
    return res.data;
  });

  handle(IpcChannels.TERM_SET_CURRENT, assertSingleIdArg, async (id) => {
    const res = await app.academics.setCurrentTerm({ id });
    return res.data;
  });

  handle(IpcChannels.TERM_DELETE, assertSingleIdArg, async (id) => {
    const res = await app.academics.deleteTerm({ id });
    return res.data;
  });
}
