import { describe, expect, it } from 'vitest';
import { createRendererPresentation } from './create-renderer-presentation';

describe('createRendererPresentation', () => {
  it('creates a presentation layer with bootstrap and stores', () => {
    const layer = createRendererPresentation();
    expect(layer).toBeDefined();
    expect(layer.bootstrap).toBeDefined();
    expect(layer.stores).toBeDefined();
    expect(layer.viewModels).toBeDefined();
  });

  it('initializes bootstrap store in idle phase', () => {
    const layer = createRendererPresentation();
    const state = layer.stores.bootstrap.store.getState();
    expect(state.phase).toBe('idle');
  });
});
