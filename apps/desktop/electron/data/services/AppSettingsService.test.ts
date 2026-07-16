import { describe, expect, it } from 'vitest';
import type { AppendAuditEntryInput } from '../dto/platform';
import type { AppSetting, AuditLogEntry } from '../models/platform';
import type { IAppSettingsRepository } from '../repositories/interfaces/IAppSettingsRepository';
import type { IAuditLogRepository } from '../repositories/interfaces/IAuditLogRepository';
import { AppSettingsService } from './AppSettingsService';
import type { TransactionRunner } from './TransactionRunner';

/** Hand-built mocks over the repository interfaces — no database. */
function makeSetting(key: string, value: unknown): AppSetting {
  return { id: `id-${key}`, key, value, createdAt: 't0', updatedAt: 't0' };
}

function makeMocks() {
  const store = new Map<string, AppSetting>();
  const audits: AppendAuditEntryInput[] = [];
  const settingsRepo: IAppSettingsRepository = {
    getByKey: (key) => store.get(key) ?? null,
    setByKey: (key, value) => {
      const setting = makeSetting(key, value);
      store.set(key, setting);
      return setting;
    },
    getAll: () => [...store.values()],
    deleteByKey: (key) => store.delete(key),
  };
  const auditRepo: IAuditLogRepository = {
    append: (input) => {
      audits.push(input);
      return {
        id: 'a1',
        category: input.category,
        event: input.event,
        details: null,
        createdAt: 't0',
      } satisfies AuditLogEntry;
    },
    findByCategory: () => [],
    findInRange: () => [],
    findPage: () => ({ items: [], total: 0, limit: 0, offset: 0 }),
    count: () => audits.length,
    prune: () => 0,
  };
  const transactions: TransactionRunner = {
    run: (work) => work(),
    runImmediate: (work) => work(),
  };
  return { settingsRepo, auditRepo, transactions, audits };
}

describe('AppSettingsService', () => {
  it('get returns the stored value or null', async () => {
    const { settingsRepo, auditRepo, transactions } = makeMocks();
    const service = new AppSettingsService({
      appSettings: settingsRepo,
      auditLog: auditRepo,
      transactions,
    });
    await expect(service.get('missing')).resolves.toBeNull();
    settingsRepo.setByKey('theme', 'dark');
    await expect(service.get('theme')).resolves.toBe('dark');
  });

  it('set writes the setting and an audit entry together', async () => {
    const { settingsRepo, auditRepo, transactions, audits } = makeMocks();
    const service = new AppSettingsService({
      appSettings: settingsRepo,
      auditLog: auditRepo,
      transactions,
    });
    const setting = await service.set('theme', 'dark');
    expect(setting.value).toBe('dark');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ category: 'application', event: 'setting.updated' });
    expect(audits[0]!.details).toEqual({ key: 'theme' }); // never the value — may be sensitive
  });

  it('remove reports whether a setting existed', async () => {
    const { settingsRepo, auditRepo, transactions } = makeMocks();
    const service = new AppSettingsService({
      appSettings: settingsRepo,
      auditLog: auditRepo,
      transactions,
    });
    settingsRepo.setByKey('theme', 'dark');
    await expect(service.remove('theme')).resolves.toBe(true);
    await expect(service.remove('theme')).resolves.toBe(false);
  });
});
