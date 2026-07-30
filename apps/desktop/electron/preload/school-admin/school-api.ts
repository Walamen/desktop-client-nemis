import { IpcChannels } from '@nemis-desktop/types';
import type { SchoolApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const schoolApi: SchoolApi = {
  getSummary: () => invoke(IpcChannels.SCHOOL_GET_SUMMARY),
};
