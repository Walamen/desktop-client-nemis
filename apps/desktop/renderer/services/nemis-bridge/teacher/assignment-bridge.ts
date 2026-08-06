import type {
  AssignmentResult,
  AssignmentSubmissionResult,
  CreateAssignmentRequest,
  GradeSubmissionRequest,
  ListAssignmentsRequest,
  PickAttachmentResult,
  UpdateAssignmentRequest,
} from '@nemis-desktop/types';
import { api } from '../api';

export const assignmentBridge = {
  listAssignments: (request: ListAssignmentsRequest): Promise<AssignmentResult[]> =>
    api().assignment.list(request),
  getAssignment: (id: string): Promise<AssignmentResult | null> => api().assignment.get(id),
  createAssignment: (request: CreateAssignmentRequest): Promise<AssignmentResult> =>
    api().assignment.create(request),
  updateAssignment: (request: UpdateAssignmentRequest): Promise<AssignmentResult> =>
    api().assignment.update(request),
  deleteAssignment: (id: string): Promise<{ id: string }> => api().assignment.delete(id),
  listAssignmentSubmissions: (assignmentId: string): Promise<AssignmentSubmissionResult[]> =>
    api().assignment.listSubmissions(assignmentId),
  gradeAssignmentSubmission: (
    request: GradeSubmissionRequest,
  ): Promise<AssignmentSubmissionResult> => api().assignment.gradeSubmission(request),
  pickAssignmentAttachment: (): Promise<PickAttachmentResult | null> => api().assignment.pickAttachment(),
  openAssignmentAttachment: (attachmentUrl: string): Promise<{ opened: boolean }> =>
    api().assignment.openAttachment(attachmentUrl),
};
