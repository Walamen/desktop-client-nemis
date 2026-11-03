/**
 * Controlled `next/navigation` for renderer tests, independent of
 * `window.location` (as in the real app, where the router renders a page
 * before the address bar updates).
 *
 * In a test file:
 *   vi.mock('next/navigation', async () => (await import('@/test-utils/search-params')).navigationMock);
 *   mockSearch('id=abc');
 */
const search = { value: new URLSearchParams() };

export function mockSearch(query: string): void {
  search.value = new URLSearchParams(query);
}

export const navigationMock = {
  useSearchParams: () => search.value,
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
};
