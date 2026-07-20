import { act, render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it } from 'vitest';
import { useViewModel } from './use-view-model';

describe('useViewModel', () => {
  it('renders selected state and re-renders on change', () => {
    const store = createStore<{ count: number }>(() => ({ count: 0 }));
    function Probe() {
      const count = useViewModel(store, (s) => s.count);
      return <span data-testid="count">{count}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    act(() => store.setState({ count: 5 }));
    expect(screen.getByTestId('count')).toHaveTextContent('5');
  });
});
