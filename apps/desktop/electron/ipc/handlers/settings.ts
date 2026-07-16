import { IpcChannels } from '@nemis-desktop/types';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertSettingKeyArg } from '@app/security/validateIpc';
import { assertRendererReadableSetting } from '@app/security/settingsAllowlist';
import type { AppSettingsService } from '@app/data/services/AppSettingsService';

/** Shape first (arity + type + bounds), then authorization (allowlist). */
function validateSettingsGet(args: readonly unknown[]): void {
  assertSettingKeyArg(args);
  assertRendererReadableSetting(args[0] as string);
}

export function registerSettingsHandlers(handle: IpcHandle, settings: AppSettingsService): void {
  // arity: validateSettingsGet guarantees exactly one allowlisted string arg —
  // matches args: [key: string].
  handle(IpcChannels.SETTINGS_GET, validateSettingsGet, (key) => settings.get(key));
}
