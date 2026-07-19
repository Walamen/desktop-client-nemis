import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { NotImplementedPresentationError } from '../../errors';

/** EXTENSION POINT — no dashboard aggregate use cases exist yet (Phase 5 has
 * no count/summary queries). State shape is fixed now so the screen can be
 * scaffolded; implement loadSummary when the application layer grows summary
 * queries. See _extension-template/README.md. */
export interface DashboardSummaryView {
  readonly totalStudents: number;
  readonly presentToday: number;
  readonly pendingGrades: number;
}

export interface DashboardState {
  readonly summary: AsyncState<DashboardSummaryView>;
}

export class DashboardViewModel {
  readonly store = createStore<DashboardState>(() => ({ summary: idleState() }));

  loadSummary(): Promise<void> {
    throw new NotImplementedPresentationError('Dashboard');
  }
}
