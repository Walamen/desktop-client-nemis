import { describe, expect, it } from 'vitest';
import { IpcChannels } from '@nemis-desktop/types';
import type { IpcChannel } from '@nemis-desktop/types';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { registerAcademicContextHandlers } from './academicContext';

describe('registerAcademicContextHandlers', () => {
  it('reads the workspace school and today from the clock', () => {
    const calls = new Map<string, { validate: IpcValidator; handler: () => unknown }>();
    const handle = ((c: IpcChannel, validate: IpcValidator, handler: () => unknown) => {
      calls.set(c, { validate, handler });
    }) as unknown as IpcHandle;
    const seen: unknown[][] = [];
    const connection = {
      prepare: (sql: string) => ({
        get: (...args: unknown[]) => {
          seen.push([sql, ...args]);
          return sql.includes('provisioning_metadata') ? { institutionId: 'inst-1' } : undefined;
        },
      }),
    };
    const workspaces = { active: { database: { connection } } } as unknown as WorkspaceManager;
    registerAcademicContextHandlers(handle, workspaces, () => new Date('2027-03-20T23:30:00.000Z'));
    const call = calls.get(IpcChannels.ACADEMIC_CONTEXT_GET)!;
    expect(call.handler()).toEqual({ year: null, term: null, period: null });
    expect(seen[1]).toEqual([expect.stringContaining('academic_years'), 'inst-1', 'inst-1']);
    expect(() => call.validate(['x'])).toThrow();
  });
});
