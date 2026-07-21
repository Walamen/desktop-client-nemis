import type { BootstrapStore } from '../stores/bootstrap-store';

export interface BootstrapTask {
  readonly name: string;
  run(): Promise<void>;
  /** Whether the task's ViewModel ended in an error state after run(). */
  hasError(): boolean;
}

/** Drives the renderer's startup sequence. All tasks run in parallel via
 * Promise.allSettled, so one slow or failing load never blocks the others;
 * each task's ViewModel keeps its own independent async state. */
export class BootstrapService {
  constructor(
    private readonly store: BootstrapStore,
    private readonly tasks: readonly BootstrapTask[],
  ) {}

  async run(): Promise<void> {
    this.store.start(this.tasks.map((t) => t.name));
    await Promise.allSettled(this.tasks.map((t) => t.run()));
    for (const task of this.tasks) {
      if (task.hasError()) this.store.markFailed(task.name);
      else this.store.markDone(task.name);
    }
    this.store.finish();
  }
}
