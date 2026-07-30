import type {
  ClassListRequest,
  ClassResult,
  ClassSubjectPairRequest,
  ClassSubjectResult,
  CreateClassRequest,
  DeletedResult,
  GradeLevelCountResult,
  PagedListResult,
  SetActiveRequest,
  UpdateClassRequest,
} from '@nemis-desktop/types';
import { api } from '../api';

export const classBridge = {
  listClasses: (request: ClassListRequest): Promise<PagedListResult<ClassResult>> =>
    api().classes.list(request),
  createClass: (request: CreateClassRequest): Promise<ClassResult> => api().classes.create(request),
  updateClass: (request: UpdateClassRequest): Promise<ClassResult> => api().classes.update(request),
  setClassActive: (request: SetActiveRequest): Promise<ClassResult> =>
    api().classes.setActive(request),
  getGradeLevelCounts: (): Promise<GradeLevelCountResult[]> => api().classes.gradeLevelCounts(),
  listClassSubjects: (classId: string): Promise<ClassSubjectResult[]> =>
    api().classes.listSubjects(classId),
  assignSubjectToClass: (request: ClassSubjectPairRequest): Promise<ClassSubjectResult> =>
    api().classes.assignSubject(request),
  unassignSubjectFromClass: (request: ClassSubjectPairRequest): Promise<DeletedResult> =>
    api().classes.unassignSubject(request),
};
