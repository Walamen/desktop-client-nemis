import { describe, expect, it } from 'vitest';
import { BootstrapStore } from '../stores/bootstrap-store';
import { BootstrapService, type BootstrapTask } from './bootstrap-service';

function task(name: string, opts: { error?: boolean; throws?: boolean } = {}): BootstrapTask {
  return {
    name,
    run: async () => {
      if (opts.throws) throw new Error('boom');
    },
    hasError: () => opts.error ?? false,
  };
}

describe('BootstrapService', () => {
  it('marks all tasks done and phase ready when none error', async () => {
    const store = new BootstrapStore();
    await new BootstrapService(store, [task('device'), task('user')]).run();
    const state = store.store.getState();
    expect(state.phase).toBe('ready');
    expect(state.done).toEqual(['device', 'user']);
    expect(state.failed).toEqual([]);
  });

  it('records failed tasks but still reaches ready when some succeed', async () => {
    const store = new BootstrapStore();
    await new BootstrapService(store, [task('device'), task('school', { error: true })]).run();
    const state = store.store.getState();
    expect(state.phase).toBe('ready');
    expect(state.done).toEqual(['device']);
    expect(state.failed).toEqual(['school']);
  });

  it('phase is error when every task fails (e.g. database unavailable)', async () => {
    const store = new BootstrapStore();
    await new BootstrapService(store, [task('a', { error: true }), task('b', { error: true })]).run();
    expect(store.store.getState().phase).toBe('error');
  });

  it('a throwing task does not prevent the others from settling', async () => {
    const store = new BootstrapStore();
    await new BootstrapService(store, [task('a', { throws: true, error: true }), task('b')]).run();
    const state = store.store.getState();
    expect(state.done).toEqual(['b']);
    expect(state.failed).toEqual(['a']);
  });
});
