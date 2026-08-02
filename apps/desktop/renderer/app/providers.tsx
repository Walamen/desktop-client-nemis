'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { Spinner } from '@nemis-desktop/ui';
import { PresentationProvider } from '../lib/presentation/presentation-provider';
import { createRendererPresentation } from '../lib/presentation/create-renderer-presentation';
import { sharedBridge } from '../services/nemis-bridge/shared';

export function RootProviders({ children }: { children: ReactNode }) {
  const layer = useMemo(() => createRendererPresentation(), []);
  const phase = useStore(layer.stores.bootstrap.store, (s) => s.phase);

  useEffect(() => {
    // Bootstrap's tasks (current user, current school, dashboard overview, …)
    // read through the main process's active workspace, which only exists
    // once a session has been restored — getProvisioningStatus() is what
    // triggers that restore. Running bootstrap before this resolves races an
    // inactive workspace and silently no-ops each task; a renderer reload
    // then "fixes" it only because the main process (unlike the renderer)
    // kept the now-active workspace from the first attempt.
    void sharedBridge.getProvisioningStatus().finally(() => {
      void layer.bootstrap.run();
    });
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
