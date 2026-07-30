import { render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';

const store = createStore(() => ({ notifications: [{ id: 'n1', kind: 'success', message: 'Saved!', autoDismissMs: null, createdAt: 0 }] }));
vi.mock('../../lib/presentation/hooks/shared', () => ({ useNotificationStore: () => ({ store, dismiss: vi.fn() }) }));

import { ToastHost } from './ToastHost';

describe('ToastHost', () => {
  it('renders notifications from the store', () => {
    render(<ToastHost />);
    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });
});
