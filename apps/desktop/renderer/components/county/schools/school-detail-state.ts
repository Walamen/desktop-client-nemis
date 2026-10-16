import type { AsyncState } from '@nemis-desktop/presentation';

/** What the School detail page shows for `schoolId`. The view model outlives
 * the page, so its state may still describe a previously opened school
 * (`requestedId`, or the loaded data's own id): that is "still loading", never
 * that school's data and never "not found" — even for the one frame painted
 * before the load effect runs. */
export function resolveSchoolDetail<T extends { id: string }>(
  schoolId: string,
  requestedId: string | null,
  detail: AsyncState<T>,
): { school: T | null; isLoading: boolean; isError: boolean } {
  if (!schoolId) return { school: null, isLoading: false, isError: true };
  if (requestedId !== schoolId) return { school: null, isLoading: true, isError: false };
  if (detail.status === 'error' || detail.status === 'empty') {
    return { school: null, isLoading: false, isError: true };
  }
  const loaded = detail.status === 'success' || detail.status === 'refreshing' ? detail.data : null;
  const school = loaded && loaded.id === schoolId ? loaded : null;
  return { school, isLoading: !school, isError: false };
}
