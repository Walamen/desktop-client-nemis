import type { ISettingsGateway, SettingOutput } from '@nemis-desktop/application';
import type { IAppSettingsRepository } from '../repositories/interfaces/IAppSettingsRepository';
import type { IAuditLogRepository } from '../repositories/interfaces/IAuditLogRepository';
import type { TransactionRunner } from '../services/TransactionRunner';

/** Adapts settings persistence to the application's ISettingsGateway. Writes the
 * setting and its audit entry atomically, mirroring AppSettingsService.set. */
export class SettingsGatewayAdapter implements ISettingsGateway {
  constructor(
    private readonly settings: IAppSettingsRepository,
    private readonly auditLog: IAuditLogRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  set(key: string, value: unknown): SettingOutput {
    const setting = this.transactions.run(() => {
      const written = this.settings.setByKey(key, value);
      this.auditLog.append({ category: 'application', event: 'setting.updated', details: { key } });
      return written;
    });
    return { key: setting.key, value: setting.value, updatedAt: setting.updatedAt };
  }

  get(key: string): unknown {
    return this.settings.getByKey(key)?.value ?? null;
  }
}
