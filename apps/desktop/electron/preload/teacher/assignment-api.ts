import { IpcChannels } from '@nemis-desktop/types';
import type { AssignmentApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const assignmentApi: AssignmentApi = {
  list: (request) => invoke(IpcChannels.ASSIGNMENT_LIST, request),
  get: (id) => invoke(IpcChannels.ASSIGNMENT_GET, id),
  create: (request) => invoke(IpcChannels.ASSIGNMENT_CREATE, request),
  update: (request) => invoke(IpcChannels.ASSIGNMENT_UPDATE, request),
  delete: (id) => invoke(IpcChannels.ASSIGNMENT_DELETE, id),
  listSubmissions: (assignmentId) => invoke(IpcChannels.ASSIGNMENT_LIST_SUBMISSIONS, assignmentId),
  gradeSubmission: (request) => invoke(IpcChannels.ASSIGNMENT_GRADE_SUBMISSION, request),
  pickAttachment: () => invoke(IpcChannels.ASSIGNMENT_PICK_ATTACHMENT),
  openAttachment: (attachmentUrl) => invoke(IpcChannels.ASSIGNMENT_OPEN_ATTACHMENT, attachmentUrl),
};
