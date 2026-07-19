export interface DeviceView {
  readonly id: string;
  readonly deviceName: string;
  readonly platform: string;
  readonly appVersion: string;
  readonly registeredAt: string;
}

export interface SettingView {
  readonly key: string;
  readonly value: unknown;
  readonly updatedAt: string;
}
