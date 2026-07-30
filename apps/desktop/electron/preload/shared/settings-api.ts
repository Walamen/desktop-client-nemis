import { IpcChannels } from '@nemis-desktop/types';
import type { SettingsApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const settingsApi: SettingsApi = {
  get: (key: string) => invoke(IpcChannels.SETTINGS_GET, key),
};
