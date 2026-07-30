import type { SchoolSummaryResult } from '@nemis-desktop/types';
import { api } from '../api';

export const institutionBridge = {
  getSchoolSummary: (): Promise<SchoolSummaryResult | null> => api().school.getSummary(),
};
