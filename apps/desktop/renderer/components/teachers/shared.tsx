export const human = (v: string) =>
  v.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const queryId = () =>
  typeof window === 'undefined'
    ? ''
    : (new URLSearchParams(window.location.search).get('id') ?? '');

export function rows<T>(state: { status: string; data?: readonly T[] }): readonly T[] {
  return state.status === 'success' || state.status === 'refreshing' ? state.data ?? [] : [];
}
