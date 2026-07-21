import type { Class } from '@nemis-desktop/domain';
import type { GradeLevel } from '@nemis-desktop/types';

export interface ClassPageFilter {
  limit: number;
  offset: number;
  keyword?: string;
  academicYearId?: string;
  gradeLevel?: GradeLevel;
  includeInactive?: boolean;
  sort?: 'name' | 'gradeLevel' | 'updatedAt';
}

export interface ClassPage {
  items: Class[];
  total: number;
}

export interface GradeLevelCount {
  gradeLevel: GradeLevel;
  classCount: number;
}

export interface IClassRepository {
  findById(id: string): Class | null;
  exists(id: string): boolean;
  /** Real COUNT(*) — total classes in this installation. */
  countAll(): number;
  findPage(filter: ClassPageFilter): ClassPage;
  existsByName(
    institutionId: string,
    academicYearId: string,
    name: string,
    excludeId?: string,
  ): boolean;
  countByGradeLevel(): GradeLevelCount[];
  countSubjects(classId: string): number;
  save(entity: Class): void;
}
