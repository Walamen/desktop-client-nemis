export interface RegisterDeviceDto {
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
}

export interface DeviceOutput {
  id: string;
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSettingsDto {
  key: string;
  value: unknown;
}

export interface SettingOutput {
  key: string;
  value: unknown;
  updatedAt: string;
}
