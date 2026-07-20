'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { PresentationLayer } from '@nemis-desktop/presentation';
import { PresentationProvider } from '../lib/presentation/presentation-provider';
import { createRendererPresentation } from '../lib/presentation/create-renderer-presentation';
import { Spinner } from '@nemis-desktop/ui';

export function RootProviders({ children }: { children: ReactNode }) {
  const [layer, setLayer] = useState<PresentationLayer | null>(null);

  useEffect(() => {
    let active = true;
    void createRendererPresentation().then((l) => {
      if (active) setLayer(l);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!layer) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" />
      </div>
    );
  }
  return <PresentationProvider layer={layer}>{children}</PresentationProvider>;
}
