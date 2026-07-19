import type { DeviceOutput, SettingOutput } from '@nemis-desktop/application';
import { formatIsoDateTime } from '../../formatters/format-date';
import type { DeviceView, SettingView } from '../../view-models/device/device-views';

export function toDeviceView(dto: DeviceOutput): DeviceView {
  return {
    id: dto.id,
    deviceName: dto.deviceName,
    platform: `${dto.platform} ${dto.osVersion}`,
    appVersion: dto.appVersion,
    registeredAt: formatIsoDateTime(dto.createdAt),
  };
}

export function toSettingView(dto: SettingOutput): SettingView {
  return { key: dto.key, value: dto.value, updatedAt: formatIsoDateTime(dto.updatedAt) };
}
