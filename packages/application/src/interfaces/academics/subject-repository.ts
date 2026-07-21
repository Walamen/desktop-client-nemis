import type { Subject } from '@nemis-desktop/domain';

export interface SubjectPageFilter {
  limit: number;
  offset: number;
  keyword?: string;
  includeInactive?: boolean;
  sort?: 'name' | 'code' | 'updatedAt';
}

export interface SubjectPage {
  items: Subject[];
  total: number;
}

export interface ClassSubjectLink {
  classId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  assignedAt: string;
}

export interface AssignClassSubjectInput {
  id: string;
  classId: string;
  subjectId: string;
  assignedAt: string;
}

export interface ISubjectRepository {
  findById(id: string): Subject | null;
  findPage(filter: SubjectPageFilter): SubjectPage;
  existsByCode(institutionId: string, code: string, excludeId?: string): boolean;
  /** Real COUNT(*) of active subjects — used by the dashboard overview. */
  countAll(): number;
  countClasses(subjectId: string): number;
  save(subject: Subject): void;
  listClassSubjects(classId: string): ClassSubjectLink[];
  isAssigned(classId: string, subjectId: string): boolean;
  assign(link: AssignClassSubjectInput): void;
  unassign(classId: string, subjectId: string): void;
}
