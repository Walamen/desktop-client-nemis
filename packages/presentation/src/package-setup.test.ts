import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';

describe('package setup', () => {
  it('creates and updates a vanilla zustand store', () => {
    const store = createStore<{ n: number }>(() => ({ n: 1 }));
    store.setState({ n: 2 });
    expect(store.getState().n).toBe(2);
  });
});
