import type { SettingOutput } from '../../dto/infra/infra-dto';

export interface ISettingsGateway {
  set(key: string, value: unknown): SettingOutput;
  get(key: string): unknown;
}
