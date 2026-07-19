import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { NotImplementedPresentationError } from '../../errors';

/** EXTENSION POINT — the Teachers/Staff domain was not built in Phases 4–5.
 * Implement when the domain and application slices exist. */
export interface TeacherRowView {
  readonly id: string;
  readonly fullName: string;
  readonly position: string;
}

export interface TeachersState {
  readonly list: AsyncState<readonly TeacherRowView[]>;
}

export class TeachersViewModel {
  readonly store = createStore<TeachersState>(() => ({ list: idleState() }));

  async loadTeachers(): Promise<void> {
    throw new NotImplementedPresentationError('Teachers');
  }
}
