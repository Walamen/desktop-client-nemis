import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoInfrastructureResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export type DeoInfrastructureActionKind = 'review' | 'resolve' | 'escalate';

export interface DeoInfrastructureState {
  readonly infrastructure: AsyncState<DeoInfrastructureResult>;
  /** True while a Review / Resolve / Escalate call is in flight. */
  readonly acting: boolean;
  readonly actionError: string | null;
}

export interface DeoInfrastructureViewModelDeps {
  readonly deo: DeoApplicationService;
}

const ACTION_ERROR = "Couldn't save this action. Try again.";

/** The DEO Infrastructure page: the district's open issues and the three
 * actions on them. Actions are written on this device, synced later. */
export class DeoInfrastructureViewModel {
  readonly store = createStore<DeoInfrastructureState>(() => ({
    infrastructure: idleState(),
    acting: false,
    actionError: null,
  }));

  constructor(private readonly deps: DeoInfrastructureViewModelDeps) {}

  async load(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().infrastructure,
        set: (infrastructure) => this.store.setState({ infrastructure }),
      },
      fetch: () => this.deps.deo.getInfrastructure(),
      map: (result): DeoInfrastructureResult => result,
    });
  }

  /** Runs one action, then reloads. Never throws; one at a time. `text` is the
   * optional comment (review / resolve) or the reason (escalate). */
  async act(kind: DeoInfrastructureActionKind, issueId: string, text?: string): Promise<boolean> {
    if (this.store.getState().acting) return false;
    this.store.setState({ acting: true, actionError: null });
    try {
      const { deo } = this.deps;
      const request = text === undefined ? { issueId } : { issueId, comments: text };
      const response =
        kind === 'escalate'
          ? await deo.escalateInfrastructure({ issueId, reason: text ?? '' })
          : kind === 'review'
            ? await deo.reviewInfrastructure(request)
            : await deo.resolveInfrastructure(request);
      await this.load();
      if (!response.data) {
        this.store.setState({ actionError: ACTION_ERROR });
        return false;
      }
      return true;
    } catch {
      this.store.setState({ actionError: ACTION_ERROR });
      return false;
    } finally {
      this.store.setState({ acting: false });
    }
  }

  clearActionError(): void {
    this.store.setState({ actionError: null });
  }
}
