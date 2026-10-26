import { ForbiddenError } from '@nemis-desktop/shared';
import { IpcChannels, SystemRole } from '@nemis-desktop/types';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs, assertSingleIdArg } from '@app/security/validateIpc';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import {
  SqliteReportCardReadModel,
  type ReportCardViewer,
} from '@app/data/repositories/sqlite/business/SqliteReportCardReadModel';

/** Report cards for school administrators and teachers (see
 * authorizeChannel.ts). Reads the active workspace's own database; the viewer
 * is derived from the signed-in user, never from renderer input, and the read
 * model enforces what a teacher may see. */
export function registerReportCardHandlers(handle: IpcHandle, workspaces: WorkspaceManager): void {
  const viewerFor = (user: { id: string; role: string }): ReportCardViewer => {
    if (user.role === SystemRole.INSTITUTION_ADMIN) return { teacherUserId: null };
    if (user.role === SystemRole.TEACHER) return { teacherUserId: user.id };
    // authorizeChannel already refuses every other role; never widen to admin scope here.
    throw new ForbiddenError('Report cards are only available to school administrators and teachers.');
  };
  const context = (): { model: SqliteReportCardReadModel; viewer: ReportCardViewer } => {
    const { database, user } = workspaces.active;
    return {
      model: new SqliteReportCardReadModel({ connection: database.connection }),
      viewer: viewerFor(user),
    };
  };

  handle(IpcChannels.REPORT_CARDS_LIST_FOR_STUDENT, assertSingleIdArg, (studentId: string) => {
    const { model, viewer } = context();
    return model.listForStudent(viewer, studentId);
  });
  handle(IpcChannels.REPORT_CARDS_LIST_FOR_CLASS, assertSingleIdArg, (classId: string) => {
    const { model, viewer } = context();
    return model.listForClass(viewer, classId);
  });
  handle(IpcChannels.REPORT_CARD_GET_ISSUE, assertSingleIdArg, (issueId: string) => {
    const { model, viewer } = context();
    return model.getIssue(viewer, issueId);
  });
  handle(IpcChannels.REPORT_CARDS_LIST_ARCHIVED_YEARS, assertNoArgs, () => {
    const { model, viewer } = context();
    return model.listArchivedYears(viewer);
  });
}
