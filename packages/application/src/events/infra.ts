import type { ApplicationEvent } from '../interfaces/event-publisher';

export interface DeviceRegistered extends ApplicationEvent {
  readonly name: 'DeviceRegistered';
  readonly deviceId: string;
}

export interface SettingsUpdated extends ApplicationEvent {
  readonly name: 'SettingsUpdated';
  readonly key: string;
}
