import type { AppSetting } from '../../models/platform';

/** Key-addressed application settings; values are JSON-serializable. */
export interface IAppSettingsRepository {
  getByKey(key: string): AppSetting | null;
  setByKey(key: string, value: unknown): AppSetting;
  getAll(): AppSetting[];
  deleteByKey(key: string): boolean;
}
