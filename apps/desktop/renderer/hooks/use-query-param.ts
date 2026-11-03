'use client';

import { useSearchParams } from 'next/navigation';

/** The value of `?name=` for the page being rendered, or '' when absent.
 * Reads the router's search params, not `window.location`: after an in-app
 * link, Next renders the new page before the address bar updates. The route
 * must sit under a <Suspense> boundary. */
export function useQueryParam(name: string): string {
  return useSearchParams()?.get(name) ?? '';
}
