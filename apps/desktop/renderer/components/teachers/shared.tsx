export const human = (v: string) =>
  v.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const queryId = () =>
  typeof window === 'undefined'
    ? ''
    : (new URLSearchParams(window.location.search).get('id') ?? '');

export function rows<T>(state: { status: string; data?: readonly T[] }): readonly T[] {
  return state.status === 'success' || state.status === 'refreshing' ? state.data ?? [] : [];
}

export function genderLabel(gender: string): string {
  if (gender === 'MALE') return 'Male';
  if (gender === 'FEMALE') return 'Female';
  return 'Other';
}

export function genderBadgeClass(gender: string): string {
  if (gender === 'MALE') return 'bg-blue-100 text-blue-700';
  if (gender === 'FEMALE') return 'bg-pink-100 text-pink-700';
  return 'bg-slate-100 text-slate-700';
}
