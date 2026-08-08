import { IpcChannels } from '@nemis-desktop/types';
import type { InstitutionApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const institutionApi: InstitutionApi = {
  list: () => invoke(IpcChannels.INSTITUTION_LIST),
};
