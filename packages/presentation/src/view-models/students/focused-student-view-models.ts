import type {
  CreateGuardianDto,
  CreateStudentDto,
  EnrollStudentDto,
  ListStudentsDto,
  MoveEnrollmentClassDto,
  SetStudentActiveDto,
  UpdateStudentDto,
} from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import type { StudentsViewModel } from './students-view-model';

export interface StudentSelectionState {
  readonly selectedIds: ReadonlySet<string>;
}

/** Directory-focused facade. Selection is deliberately presentation-only so
 * future bulk import/export work cannot leak into the domain or repository. */
export class StudentsListViewModel {
  readonly store;
  readonly selection = createStore<StudentSelectionState>(() => ({
    selectedIds: new Set<string>(),
  }));

  constructor(private readonly core: StudentsViewModel) {
    this.store = core.store;
  }

  loadStudents = () => this.core.loadStudents();
  goToPage = (page: number) => this.core.goToPage(page);
  setPageSize = (pageSize: number) => this.core.setPageSize(pageSize);
  createStudent = (dto: CreateStudentDto) => this.core.createStudent(dto);

  toggleSelection(studentId: string): void {
    this.selection.setState((state) => {
      const selectedIds = new Set(state.selectedIds);
      if (selectedIds.has(studentId)) selectedIds.delete(studentId);
      else selectedIds.add(studentId);
      return { selectedIds };
    });
  }

  selectPage(studentIds: readonly string[], selected: boolean): void {
    this.selection.setState((state) => {
      const selectedIds = new Set(state.selectedIds);
      for (const id of studentIds) {
        if (selected) selectedIds.add(id);
        else selectedIds.delete(id);
      }
      return { selectedIds };
    });
  }

  clearSelection(): void {
    this.selection.setState({ selectedIds: new Set<string>() });
  }

  /** Stable extension point for a later CSV importer. */
  getBulkSelection(): readonly string[] {
    return [...this.selection.getState().selectedIds];
  }
}

export class StudentSearchViewModel {
  readonly store;
  constructor(private readonly core: StudentsViewModel) {
    this.store = core.store;
  }
  setKeyword = (keyword: string) => this.core.setKeyword(keyword);
  setFilters = (filters: Omit<ListStudentsDto, 'limit' | 'offset'>) =>
    this.core.setFilters(filters);
  search = () => this.core.loadStudents();
}

export class StudentProfileViewModel {
  readonly store;
  constructor(private readonly core: StudentsViewModel) {
    this.store = core.store;
  }
  loadDetails = (studentId: string) => this.core.loadDetails(studentId);
  loadEnrollments = (studentId: string) => this.core.loadEnrollments(studentId);
  updateStudent = (dto: UpdateStudentDto) => this.core.updateStudent(dto);
  setStudentActive = (dto: SetStudentActiveDto) => this.core.setStudentActive(dto);
  createGuardian = (dto: CreateGuardianDto) => this.core.createGuardian(dto);
}

export class EnrollmentViewModel {
  readonly store;
  constructor(private readonly core: StudentsViewModel) {
    this.store = core.store;
  }
  enrollStudent = (dto: EnrollStudentDto) => this.core.enrollStudent(dto);
  moveEnrollmentClass = (dto: MoveEnrollmentClassDto, studentId: string) =>
    this.core.moveEnrollmentClass(dto, studentId);
}
