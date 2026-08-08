import type { Institution } from '@nemis-desktop/domain';

export interface IInstitutionRepository {
  findById(id: string): Institution | null;
  /** The single institution this install manages — valid for School Admin
   * and Teacher devices, which only ever hold one institution's data. */
  findFirst(): Institution | null;
  /** Every institution present in this device's local database, ordered by
   * name. For School Admin/Teacher this returns the same one row as
   * findFirst(); for County/DEO/Ministry it returns every institution the
   * backend scoped into this device's sync snapshot. */
  findAll(): Institution[];
}
