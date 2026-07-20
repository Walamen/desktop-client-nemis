import type { Class } from '@nemis-desktop/domain';

export interface IClassRepository {
  findById(id: string): Class | null;
  exists(id: string): boolean;
  /** Real COUNT(*) — total classes in this installation. */
  countAll(): number;
}
