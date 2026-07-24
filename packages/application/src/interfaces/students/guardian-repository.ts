import type { Guardian } from '@nemis-desktop/domain';

export interface IGuardianRepository {
  findById(id: string): Guardian | null;
  exists(id: string): boolean;
  save(guardian: Guardian): void;
  findByStudentId(studentId: string): Guardian[];
}
