import type { ISettingsGateway } from '../../interfaces/infra/settings-gateway';
import type { SettingOutput } from '../../dto/infra/infra-dto';

export class InMemorySettingsGateway implements ISettingsGateway {
  readonly store = new Map<string, unknown>();
  set(key: string, value: unknown): SettingOutput {
    this.store.set(key, value);
    return { key, value, updatedAt: '2026-07-18T00:00:00.000Z' };
  }
  get(key: string): unknown {
    return this.store.has(key) ? this.store.get(key) : null;
  }
}
