import type { GradingConfig } from '@nemis-desktop/domain';

export interface IGradingConfigRepository {
  findById(id: string): GradingConfig | null;
  save(config: GradingConfig): void;
}
