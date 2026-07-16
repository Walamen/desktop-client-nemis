import { IpcChannels } from '@nemis-desktop/types';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertSettingKeyArg } from '@app/security/validateIpc';
import type { AppSettingsService } from '@app/data/services/AppSettingsService';

export function registerSettingsHandlers(handle: IpcHandle, settings: AppSettingsService): void {
  // arity: assertSettingKeyArg guarantees exactly one string arg — matches args: [key: string].
  handle(IpcChannels.SETTINGS_GET, assertSettingKeyArg, (key) => settings.get(key));
}
