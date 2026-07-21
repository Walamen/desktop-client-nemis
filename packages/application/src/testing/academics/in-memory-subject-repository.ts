import type { Subject } from '@nemis-desktop/domain';
import type {
  AssignClassSubjectInput,
  ClassSubjectLink,
  ISubjectRepository,
  SubjectPage,
  SubjectPageFilter,
} from '../../interfaces/academics/subject-repository';

interface LinkRow extends ClassSubjectLink {
  id: string;
}

export class InMemorySubjectRepository implements ISubjectRepository {
  readonly store = new Map<string, Subject>();
  readonly links = new Map<string, LinkRow>();

  findById(id: string): Subject | null {
    return this.store.get(id) ?? null;
  }

  findPage(filter: SubjectPageFilter): SubjectPage {
    let items = [...this.store.values()];
    if (!filter.includeInactive) items = items.filter((s) => s.isActive);
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase();
      items = items.filter(
        (s) => s.name.toLowerCase().includes(kw) || s.code.toLowerCase().includes(kw),
      );
    }
    items = [...items].sort((a, b) => {
      if (filter.sort === 'code') return a.code.localeCompare(b.code);
      if (filter.sort === 'updatedAt') return a.updatedAt.localeCompare(b.updatedAt);
      return a.name.localeCompare(b.name);
    });
    const total = items.length;
    return { items: items.slice(filter.offset, filter.offset + filter.limit), total };
  }

  existsByCode(institutionId: string, code: string, excludeId?: string): boolean {
    return [...this.store.values()].some(
      (s) => s.institutionId === institutionId && s.code === code && s.id !== excludeId,
    );
  }

  countAll(): number {
    return [...this.store.values()].filter((s) => s.isActive).length;
  }

  countClasses(subjectId: string): number {
    return [...this.links.values()].filter((l) => l.subjectId === subjectId).length;
  }

  save(subject: Subject): void {
    this.store.set(subject.id, subject);
  }

  listClassSubjects(classId: string): ClassSubjectLink[] {
    return [...this.links.values()].filter((l) => l.classId === classId);
  }

  isAssigned(classId: string, subjectId: string): boolean {
    return [...this.links.values()].some(
      (l) => l.classId === classId && l.subjectId === subjectId,
    );
  }

  assign(link: AssignClassSubjectInput): void {
    const subject = this.store.get(link.subjectId);
    this.links.set(link.id, {
      id: link.id,
      classId: link.classId,
      subjectId: link.subjectId,
      subjectName: subject?.name ?? '',
      subjectCode: subject?.code ?? '',
      assignedAt: link.assignedAt,
    });
  }

  unassign(classId: string, subjectId: string): void {
    for (const [id, link] of this.links) {
      if (link.classId === classId && link.subjectId === subjectId) {
        this.links.delete(id);
        return;
      }
    }
  }
}
