'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { PresentationLayer } from '@nemis-desktop/presentation';

const PresentationContext = createContext<PresentationLayer | null>(null);

export function PresentationProvider({ layer, children }: { layer: PresentationLayer; children: ReactNode }) {
  return <PresentationContext.Provider value={layer}>{children}</PresentationContext.Provider>;
}

export function usePresentation(): PresentationLayer {
  const layer = useContext(PresentationContext);
  if (!layer) throw new Error('usePresentation must be used within a PresentationProvider.');
  return layer;
}
