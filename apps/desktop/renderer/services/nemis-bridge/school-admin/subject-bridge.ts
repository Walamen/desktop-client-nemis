import type {
  CreateSubjectRequest,
  PagedListResult,
  SetActiveRequest,
  SubjectListRequest,
  SubjectResult,
  UpdateSubjectRequest,
} from '@nemis-desktop/types';
import { api } from '../api';

export const subjectBridge = {
  listSubjects: (request: SubjectListRequest): Promise<PagedListResult<SubjectResult>> =>
    api().subject.list(request),
  createSubject: (request: CreateSubjectRequest): Promise<SubjectResult> =>
    api().subject.create(request),
  updateSubject: (request: UpdateSubjectRequest): Promise<SubjectResult> =>
    api().subject.update(request),
  setSubjectActive: (request: SetActiveRequest): Promise<SubjectResult> =>
    api().subject.setActive(request),
};
