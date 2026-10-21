'use client';

import { useEffect, useRef } from 'react';
import type { RealtimeEvent } from '@nemis-desktop/types';
import { eventsBridge } from '@/services/nemis-bridge/shared/events-bridge';

/** Calls `onEvent` for every live main-process event while mounted. The
 * latest callback is used, so callers need not memoise it. */
export function useRealtime(onEvent: (event: RealtimeEvent) => void): void {
  const latest = useRef(onEvent);
  latest.current = onEvent;
  useEffect(() => eventsBridge.subscribe((event) => latest.current(event)), []);
}
