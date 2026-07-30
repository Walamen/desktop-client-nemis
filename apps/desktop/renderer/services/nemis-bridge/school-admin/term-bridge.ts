import type {
  CreateTermRequest,
  DeletedResult,
  TermResult,
  UpdateTermRequest,
} from '@nemis-desktop/types';
import { api } from '../api';

export const termBridge = {
  listTerms: (academicYearId: string): Promise<TermResult[]> => api().term.list(academicYearId),
  getCurrentTerm: (): Promise<TermResult | null> => api().term.getCurrent(),
  createTerm: (request: CreateTermRequest): Promise<TermResult> => api().term.create(request),
  updateTerm: (request: UpdateTermRequest): Promise<TermResult> => api().term.update(request),
  setCurrentTerm: (id: string): Promise<TermResult> => api().term.setCurrent(id),
  deleteTerm: (id: string): Promise<DeletedResult> => api().term.delete(id),
};
