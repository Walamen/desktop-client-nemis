import type { CountyApplicationService } from '@nemis-desktop/application';
import type {
  RegisterSchoolsRequest,
  RegisterSchoolsResult,
  ResubmitSchoolRegistrationRequest,
  SchoolRegistration,
  SchoolRegistrationContext,
} from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { toPresentationError } from '../../errors/to-presentation-error';
import type { NotificationStore } from '../../stores/notification-store';

export interface CountySchoolRegistrationState {
  readonly context: AsyncState<SchoolRegistrationContext>;
  /** The refused school "Fix and resend" reopens; empty when it is not the admin's. */
  readonly registration: AsyncState<SchoolRegistration>;
  readonly submitting: boolean;
}

export interface CountySchoolRegistrationViewModelDeps {
  readonly county: CountyApplicationService;
  readonly notifications: NotificationStore;
}

/** Create School and Bulk Import: saving schools on this device. Commands show
 * no success toast — the pages show the spec's own messages — and a second
 * command while one is running is ignored (a double-click saves once). */
export class CountySchoolRegistrationViewModel {
  readonly store = createStore<CountySchoolRegistrationState>(() => ({
    context: idleState(),
    registration: idleState(),
    submitting: false,
  }));

  constructor(private readonly deps: CountySchoolRegistrationViewModelDeps) {}

  async loadContext(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().context,
        set: (context) => this.store.setState({ context }),
      },
      fetch: () => this.deps.county.getRegistrationContext(),
      map: (context) => context,
    });
  }

  async loadRegistration(id: string): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().registration,
        set: (registration) => this.store.setState({ registration }),
      },
      fetch: () => this.deps.county.getSchoolRegistrations([id]),
      map: (rows) => rows.find((row) => row.id === id) as SchoolRegistration,
      isEmpty: (row) => row === undefined,
    });
  }

  register(request: RegisterSchoolsRequest): Promise<RegisterSchoolsResult | null> {
    return this.#command(async () => (await this.deps.county.registerSchools(request)).data, null);
  }

  resubmit(request: ResubmitSchoolRegistrationRequest): Promise<RegisterSchoolsResult | null> {
    return this.#command(async () => (await this.deps.county.resubmitSchoolRegistration(request)).data, null);
  }

  discard(id: string): Promise<boolean> {
    return this.#command(async () => (await this.deps.county.discardSchoolRegistration(id)).data.discarded, false);
  }

  /** The admin's registrations ([] = all of them); [] on any failure. */
  async states(ids: string[]): Promise<SchoolRegistration[]> {
    try {
      return (await this.deps.county.getSchoolRegistrations(ids)).data;
    } catch {
      return [];
    }
  }

  async #command<T, F>(run: () => Promise<T>, failed: F): Promise<T | F> {
    if (this.store.getState().submitting) return failed;
    this.store.setState({ submitting: true });
    try {
      return await run();
    } catch (error) {
      this.deps.notifications.error(toPresentationError(error, 'command').userMessage);
      return failed;
    } finally {
      this.store.setState({ submitting: false });
    }
  }
}
