import type { Institution } from '@nemis-desktop/domain';

export interface IInstitutionRepository {
  findById(id: string): Institution | null;
  /** The single institution this install manages, or null before one exists. */
  findFirst(): Institution | null;
}
