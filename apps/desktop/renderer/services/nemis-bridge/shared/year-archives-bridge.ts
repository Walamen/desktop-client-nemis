import type { YearClosureRow } from '@nemis-desktop/types';
import { api } from '../api';

/** Years schools have closed, for district and county officers. */
export const yearArchivesBridge = {
  listYearClosures: (): Promise<YearClosureRow[]> => api().yearArchives.list(),
};
