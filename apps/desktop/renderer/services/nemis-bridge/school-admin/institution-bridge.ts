import type { SchoolSummaryResult, InstitutionSummaryResult } from '@nemis-desktop/types';
import { api } from '../api';

export const institutionBridge = {
  getSchoolSummary: (): Promise<SchoolSummaryResult | null> => api().school.getSummary(),
  listInstitutions: (): Promise<InstitutionSummaryResult[]> => api().institution.list(),
};
