import fs from 'node:fs';
import path from 'node:path';
import { dialog, shell } from 'electron';
import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { AttachmentStorage } from '@app/services/AttachmentStorage';
import {
  assertCreateAssignmentArgs,
  assertGradeSubmissionArgs,
  assertListAssignmentsArgs,
  assertNoArgs,
  assertOpenAttachmentArgs,
  assertSingleIdArg,
  assertUpdateAssignmentArgs,
} from '@app/security/validateIpc';

/** Teacher-exclusive — see authorizeChannel.ts's TEACHER_ONLY_CHANNELS.
 * `teacherId` is never accepted from the renderer: every call injects the
 * authenticated caller's own staff id, exactly like TEACHER_LIST_ASSIGNMENTS
 * self-scopes in teacherDirectory.ts. Ownership is then re-checked inside
 * the use cases (a caller can never touch another teacher's assignment,
 * regardless of what the renderer sends). */
export function registerAssignmentHandlers(
  handle: IpcHandle,
  app: ApplicationLayer,
  workspaces: WorkspaceManager,
): void {
  const teacherId = () => workspaces.active.user.staffId!;

  handle(IpcChannels.ASSIGNMENT_LIST, assertListAssignmentsArgs, async (request) =>
    (await app.assignments.list({ ...request, teacherId: teacherId() })).data,
  );
  handle(IpcChannels.ASSIGNMENT_GET, assertSingleIdArg, async (id) =>
    (await app.assignments.get({ id, teacherId: teacherId() })).data,
  );
  handle(IpcChannels.ASSIGNMENT_CREATE, assertCreateAssignmentArgs, async (request) => {
    const { attachmentFilePath, ...fields } = request;
    const staged = stageIfPicked(workspaces, attachmentFilePath);
    return (
      await app.assignments.create({
        ...fields,
        teacherId: teacherId(),
        attachmentUrl: staged?.attachmentUrl,
        attachmentName: staged?.attachmentName,
      })
    ).data;
  });
  handle(IpcChannels.ASSIGNMENT_UPDATE, assertUpdateAssignmentArgs, async (request) => {
    const { attachmentFilePath, ...fields } = request;
    const staged = stageIfPicked(workspaces, attachmentFilePath);
    return (
      await app.assignments.update({
        ...fields,
        teacherId: teacherId(),
        attachmentUrl: staged?.attachmentUrl,
        attachmentName: staged?.attachmentName,
      })
    ).data;
  });
  handle(IpcChannels.ASSIGNMENT_DELETE, assertSingleIdArg, async (id) =>
    (await app.assignments.remove({ id, teacherId: teacherId() })).data,
  );
  handle(IpcChannels.ASSIGNMENT_LIST_SUBMISSIONS, assertSingleIdArg, async (assignmentId) =>
    (await app.assignments.listSubmissions({ assignmentId, teacherId: teacherId() })).data,
  );
  handle(IpcChannels.ASSIGNMENT_GRADE_SUBMISSION, assertGradeSubmissionArgs, async (request) =>
    (await app.assignments.gradeSubmission({ ...request, teacherId: teacherId() })).data,
  );

  handle(IpcChannels.ASSIGNMENT_PICK_ATTACHMENT, assertNoArgs, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Attach a file',
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0]!;
    const stat = fs.statSync(filePath);
    return { path: filePath, name: path.basename(filePath), size: stat.size };
  });

  handle(IpcChannels.ASSIGNMENT_OPEN_ATTACHMENT, assertOpenAttachmentArgs, async (attachmentUrl) => {
    const localPath = AttachmentStorage.localPath(attachmentUrl);
    if (localPath) {
      if (!fs.existsSync(localPath)) throw new Error('This attachment file no longer exists on this device.');
      const openError = await shell.openPath(localPath);
      if (openError) throw new Error(openError);
    } else if (/^https?:\/\//i.test(attachmentUrl)) {
      await shell.openExternal(attachmentUrl);
    } else {
      throw new Error('This attachment location is not recognized.');
    }
    return { opened: true };
  });
}

function stageIfPicked(
  workspaces: WorkspaceManager,
  attachmentFilePath: string | undefined,
): { attachmentUrl: string; attachmentName: string } | undefined {
  if (!attachmentFilePath) return undefined;
  return new AttachmentStorage(workspaces.active.workspaceDir).stage(attachmentFilePath);
}
