import type { GradingConfig } from '@nemis-desktop/domain';
import type { IGradingConfigRepository } from '../../interfaces/institution/grading-config-repository';

export class InMemoryGradingConfigRepository implements IGradingConfigRepository {
  readonly store = new Map<string, GradingConfig>();
  findById(id: string): GradingConfig | null {
    return this.store.get(id) ?? null;
  }
  save(config: GradingConfig): void {
    this.store.set(config.id, config);
  }
}
