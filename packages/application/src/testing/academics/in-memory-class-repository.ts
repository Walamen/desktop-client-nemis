import type { Class } from '@nemis-desktop/domain';
import type { GradeLevel } from '@nemis-desktop/types';
import type {
  ClassPage,
  ClassPageFilter,
  GradeLevelCount,
  IClassRepository,
} from '../../interfaces/academics/class-repository';
import type { InMemorySubjectRepository } from './in-memory-subject-repository';

export class InMemoryClassRepository implements IClassRepository {
  readonly store = new Map<string, Class>();

  /** Optional reference to the subjects fake so countSubjects() can read the
   * class↔subject links it owns — mirrors a real SQL join across tables. */
  constructor(private readonly subjects?: InMemorySubjectRepository) {}

  findById(id: string): Class | null {
    return this.store.get(id) ?? null;
  }
  exists(id: string): boolean {
    return this.store.has(id);
  }
  countAll(): number {
    return this.store.size;
  }

  findPage(filter: ClassPageFilter): ClassPage {
    let items = [...this.store.values()];
    if (!filter.includeInactive) items = items.filter((c) => c.isActive);
    if (filter.academicYearId) {
      items = items.filter((c) => c.academicYearId === filter.academicYearId);
    }
    if (filter.gradeLevel) items = items.filter((c) => c.gradeLevel === filter.gradeLevel);
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase();
      items = items.filter((c) => c.name.toLowerCase().includes(kw));
    }
    items = [...items].sort((a, b) => {
      if (filter.sort === 'gradeLevel') return a.gradeLevel.localeCompare(b.gradeLevel);
      if (filter.sort === 'updatedAt') return a.updatedAt.localeCompare(b.updatedAt);
      return a.name.localeCompare(b.name);
    });
    const total = items.length;
    return { items: items.slice(filter.offset, filter.offset + filter.limit), total };
  }

  existsByName(
    institutionId: string,
    academicYearId: string,
    name: string,
    excludeId?: string,
  ): boolean {
    return [...this.store.values()].some(
      (c) =>
        c.institutionId === institutionId &&
        c.academicYearId === academicYearId &&
        c.name === name &&
        c.id !== excludeId,
    );
  }

  countByGradeLevel(): GradeLevelCount[] {
    const counts = new Map<GradeLevel, number>();
    for (const entity of this.store.values()) {
      if (!entity.isActive) continue;
      counts.set(entity.gradeLevel, (counts.get(entity.gradeLevel) ?? 0) + 1);
    }
    return [...counts.entries()].map(([gradeLevel, classCount]) => ({ gradeLevel, classCount }));
  }

  countSubjects(classId: string): number {
    return this.subjects?.listClassSubjects(classId).length ?? 0;
  }

  save(entity: Class): void {
    this.store.set(entity.id, entity);
  }
}
