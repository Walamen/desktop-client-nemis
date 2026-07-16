import { newId } from '../../../database/helpers/ids';
import { nowIso } from '../../../database/helpers/time';
import { TableNames } from '../../../database/schema/tableNames';
import { serializeJsonColumn } from '../../mappers/json';
import { appSettingMapper, type AppSettingRow } from '../../mappers/platformMappers';
import type { AppSetting } from '../../models/platform';
import { deleteFrom, select } from '../../queries/builders';
import { eq } from '../../queries/predicates';
import { validateSetSetting } from '../../validators/platform';
import { BaseRepository } from '../base/BaseRepository';
import type { RepositoryContext } from '../base/RepositoryContext';
import type { IAppSettingsRepository } from '../interfaces/IAppSettingsRepository';

const APP_SETTING_COLUMNS = ['id', 'key', 'value', 'createdAt', 'updatedAt'] as const;

export class SqliteAppSettingsRepository
  extends BaseRepository<AppSettingRow, AppSetting>
  implements IAppSettingsRepository
{
  constructor(context: RepositoryContext) {
    super(context, {
      table: TableNames.appSettings,
      entityName: 'AppSetting',
      columns: APP_SETTING_COLUMNS,
      mapper: appSettingMapper,
    });
  }

  getByKey(key: string): AppSetting | null {
    return this.query('getByKey', () => {
      const row = this.#rowByKey(key);
      return row ? appSettingMapper.toModel(row) : null;
    });
  }

  /** Upsert as transactional read-then-write (the builder deliberately has no UPSERT). */
  setByKey(key: string, value: unknown): AppSetting {
    this.validate(validateSetSetting, { key, value });
    const serialized = serializeJsonColumn(value, `app_settings.value (${key})`) ?? 'null';
    return this.executeTransaction(() => {
      const existing = this.#rowByKey(key);
      const now = nowIso();
      if (existing) {
        return this.updateById(existing.id, { value: serialized, updatedAt: now });
      }
      return this.insertRow({
        id: newId(),
        key,
        value: serialized,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  getAll(): AppSetting[] {
    return this.findAll({ orderBy: [{ column: 'key', direction: 'asc' }] });
  }

  deleteByKey(key: string): boolean {
    return this.query('deleteByKey', () => {
      const built = deleteFrom(TableNames.appSettings).where(eq('key', key)).build();
      return this.statements.get(built.sql).run(...built.params).changes > 0;
    });
  }

  #rowByKey(key: string): AppSettingRow | undefined {
    const built = select(TableNames.appSettings).where(eq('key', key)).limit(1).build();
    return this.statements.get(built.sql).get(...built.params) as AppSettingRow | undefined;
  }
}
