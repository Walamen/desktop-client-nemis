import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IpcChannels } from '@nemis-desktop/types';
import type { IpcChannel } from '@nemis-desktop/types';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { createTestContext, type TestContext } from '@app/data/testing/createTestContext';
import { registerYearArchiveHandlers } from './yearArchives';

describe('registerYearArchiveHandlers', () => {
  let test: TestContext;
  const calls = new Map<string, { validate: IpcValidator; handler: (...args: unknown[]) => unknown }>();
  const handle = ((c: IpcChannel, validate: IpcValidator, handler: (...args: unknown[]) => unknown) => {
    calls.set(c, { validate, handler });
  }) as unknown as IpcHandle;

  beforeEach(() => {
    test = createTestContext();
    test.context.connection.pragma('foreign_keys = OFF');
    const workspaces = {
      active: { database: { connection: test.context.connection } },
    } as unknown as WorkspaceManager;
    registerYearArchiveHandlers(handle, workspaces);
  });
  afterEach(() => test.cleanup());

  it('lists year closures from the workspace database and takes no arguments', () => {
    const call = calls.get(IpcChannels.YEAR_ARCHIVES_LIST)!;
    expect(call.handler()).toEqual([]);
    expect(() => call.validate(['x'])).toThrow();
  });
});
