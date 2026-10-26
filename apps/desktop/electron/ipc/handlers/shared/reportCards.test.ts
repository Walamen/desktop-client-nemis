import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError } from '@nemis-desktop/shared';
import { IpcChannels, SystemRole } from '@nemis-desktop/types';
import type { IpcChannel } from '@nemis-desktop/types';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { createTestContext, type TestContext } from '@app/data/testing/createTestContext';
import { registerReportCardHandlers } from './reportCards';

describe('registerReportCardHandlers', () => {
  let test: TestContext;
  const calls = new Map<string, { validate: IpcValidator; handler: (...args: unknown[]) => unknown }>();
  const handle = ((c: IpcChannel, validate: IpcValidator, handler: (...args: unknown[]) => unknown) => {
    calls.set(c, { validate, handler });
  }) as unknown as IpcHandle;

  function register(role: string) {
    const workspaces = {
      active: { database: { connection: test.context.connection }, user: { id: 'user-1', role } },
    } as unknown as WorkspaceManager;
    registerReportCardHandlers(handle, workspaces);
  }

  beforeEach(() => {
    test = createTestContext();
    test.context.connection.pragma('foreign_keys = OFF');
    const now = '2026-07-01T00:00:00.000Z';
    test.context.connection
      .prepare(
        `INSERT INTO report_cards (id,studentId,institutionId,academicYearId,classId,gradeLevel,createdAt,updatedAt)
         VALUES ('rc-1','s-1','inst-1','y-1','c-1','GRADE_7',?,?)`,
      )
      .run(now, now);
    test.context.connection
      .prepare(
        `INSERT INTO report_card_issues (id,reportCardId,kind,version,status,payload,issuedAt)
         VALUES ('i-1','rc-1','FINAL',1,'CURRENT',?,?)`,
      )
      .run(JSON.stringify({ academicYear: { name: '2025/2026' }, class: { name: '7A' } }), now);
  });
  afterEach(() => {
    calls.clear();
    test.cleanup();
  });

  it('serves an administrator every card of the school', () => {
    register(SystemRole.INSTITUTION_ADMIN);
    const rows = calls.get(IpcChannels.REPORT_CARDS_LIST_FOR_STUDENT)!.handler('s-1') as { issueId: string }[];
    expect(rows.map((r) => r.issueId)).toEqual(['i-1']);
  });

  it('scopes a teacher by their own user id, never by anything the renderer sends', () => {
    register(SystemRole.TEACHER);
    expect(() => calls.get(IpcChannels.REPORT_CARDS_LIST_FOR_CLASS)!.handler('c-1')).toThrow(ForbiddenError);
    expect(() => calls.get(IpcChannels.REPORT_CARD_GET_ISSUE)!.handler('i-1')).toThrow(ForbiddenError);
  });

  it('lists archived years without arguments', () => {
    register(SystemRole.INSTITUTION_ADMIN);
    const call = calls.get(IpcChannels.REPORT_CARDS_LIST_ARCHIVED_YEARS)!;
    expect(call.handler()).toEqual([]);
    expect(() => call.validate(['x'])).toThrow();
  });

  it('rejects malformed ids', () => {
    register(SystemRole.INSTITUTION_ADMIN);
    for (const channel of [
      IpcChannels.REPORT_CARDS_LIST_FOR_STUDENT,
      IpcChannels.REPORT_CARDS_LIST_FOR_CLASS,
      IpcChannels.REPORT_CARD_GET_ISSUE,
    ]) {
      const { validate } = calls.get(channel)!;
      expect(() => validate([])).toThrow();
      expect(() => validate([''])).toThrow();
      expect(() => validate([42])).toThrow();
      expect(() => validate(['a', 'b'])).toThrow();
      expect(() => validate(['ok'])).not.toThrow();
    }
  });
});
