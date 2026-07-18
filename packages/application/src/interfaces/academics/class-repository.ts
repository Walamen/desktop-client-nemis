import type { Class } from '@nemis-desktop/domain';

export interface IClassRepository {
  findById(id: string): Class | null;
  exists(id: string): boolean;
}
