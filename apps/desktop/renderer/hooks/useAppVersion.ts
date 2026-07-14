'use client';

import { useEffect, useState } from 'react';
import { getAppVersion } from '@/services/system';

interface AppVersionState {
  version: string | null;
  error: string | null;
}

export function useAppVersion(): AppVersionState {
  const [state, setState] = useState<AppVersionState>({ version: null, error: null });

  useEffect(() => {
    let cancelled = false;
    getAppVersion()
      .then((version) => {
        if (!cancelled) setState({ version, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            version: null,
            error: err instanceof Error ? err.message : 'Failed to load version.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
