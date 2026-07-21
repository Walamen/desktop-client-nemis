'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { Spinner } from '@nemis-desktop/ui';
import { PresentationProvider } from '../lib/presentation/presentation-provider';
import { createRendererPresentation } from '../lib/presentation/create-renderer-presentation';

export function RootProviders({ children }: { children: ReactNode }) {
  const layer = useMemo(() => createRendererPresentation(), []);
  const phase = useStore(layer.stores.bootstrap.store, (s) => s.phase);

  useEffect(() => {
    void layer.bootstrap.run();
  }, [layer]);

  if (phase === 'idle' || phase === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" />
      </div>
    );
  }
  return <PresentationProvider layer={layer}>{children}</PresentationProvider>;
}
