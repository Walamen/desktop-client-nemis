import type { AppSetting } from '../models/platform';
import type { IAppSettingsRepository } from '../repositories/interfaces/IAppSettingsRepository';
import type { IAuditLogRepository } from '../repositories/interfaces/IAuditLogRepository';
import type { TransactionRunner } from './TransactionRunner';

export interface AppSettingsServiceDeps {
  appSettings: IAppSettingsRepository;
  auditLog: IAuditLogRepository;
  transactions: TransactionRunner;
}

export class AppSettingsService {
  readonly #deps: AppSettingsServiceDeps;

  constructor(deps: AppSettingsServiceDeps) {
    this.#deps = deps;
  }

  /** The stored value, or null when the key does not exist. */
  get(key: string): Promise<unknown> {
    return Promise.resolve(this.#deps.appSettings.getByKey(key)?.value ?? null);
  }

  getAll(): Promise<AppSetting[]> {
    return Promise.resolve(this.#deps.appSettings.getAll());
  }

  /** Writes the setting and its audit entry atomically (cross-repo transaction). */
  set(key: string, value: unknown): Promise<AppSetting> {
    return Promise.resolve(
      this.#deps.transactions.run(() => {
        const setting = this.#deps.appSettings.setByKey(key, value);
        // Audit the key only — setting values may be sensitive.
        this.#deps.auditLog.append({
          category: 'application',
          event: 'setting.updated',
          details: { key },
        });
        return setting;
      }),
    );
  }

  remove(key: string): Promise<boolean> {
    return Promise.resolve(this.#deps.appSettings.deleteByKey(key));
  }
}
