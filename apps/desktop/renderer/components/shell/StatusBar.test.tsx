import { render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';

const connectivityStore = createStore(() => ({ isOnline: true, syncStatus: 'idle', lastSyncAt: null }));

// setOnline is part of the real connectivity store's contract and StatusBar
// calls it once a sync status arrives; the mock must provide it rather than
// relying on the bridge rejecting first under jsdom.
vi.mock('../../lib/presentation/hooks', () => ({
  useConnectivityStore: () => ({ store: connectivityStore, setOnline: vi.fn() }),
  useSyncViewModel: () => ({ store: connectivityStore }),
}));
vi.mock('../../hooks/useAppVersion', () => ({ useAppVersion: () => ({ version: '1.0.0', error: null }) }));

import { StatusBar } from './StatusBar';

describe('StatusBar', () => {
  it('shows online status, database ready, and app version', () => {
    render(<StatusBar />);
    expect(screen.getByText(/Online/i)).toBeInTheDocument();
    expect(screen.getByText(/Local database ready/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Not synced yet/i)).toBeInTheDocument();
  });
});
