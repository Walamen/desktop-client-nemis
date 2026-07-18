import type { Institution } from '@nemis-desktop/domain';

export interface IInstitutionRepository {
  findById(id: string): Institution | null;
}
