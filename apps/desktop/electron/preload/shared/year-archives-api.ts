import { IpcChannels } from '@nemis-desktop/types';
import type { YearArchivesApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const yearArchivesApi: YearArchivesApi = {
  list: () => invoke(IpcChannels.YEAR_ARCHIVES_LIST),
};
