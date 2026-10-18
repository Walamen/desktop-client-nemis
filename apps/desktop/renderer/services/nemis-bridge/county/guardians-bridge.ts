import type { CountyGuardianDetail, CountyGuardiansQuery, CountyGuardiansResult } from '@nemis-desktop/types';
import { api } from '../api';

export const guardiansBridge = {
  listGuardians: (query: CountyGuardiansQuery): Promise<CountyGuardiansResult> => api().county.listGuardians(query),
  getGuardian: (guardianId: string): Promise<CountyGuardianDetail | null> => api().county.getGuardian(guardianId),
};
