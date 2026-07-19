import { describe, expect, it } from 'vitest';
import {
  clearSearch,
  createSearch,
  matchesKeyword,
  withFilters,
  withKeyword,
} from './search-state';

describe('search state', () => {
  it('creates defaults and updates immutably', () => {
    const s = createSearch();
    expect(s).toEqual({ keyword: '', filters: [], debounceMs: 300 });
    const withKw = withKeyword(s, 'ada');
    expect(withKw.keyword).toBe('ada');
    expect(s.keyword).toBe('');
    const filtered = withFilters(withKw, [{ field: 'isActive', operator: 'eq', value: true }]);
    expect(filtered.filters).toHaveLength(1);
    expect(clearSearch(filtered)).toEqual({ keyword: '', filters: [], debounceMs: 300 });
  });

  it('matchesKeyword is case-insensitive, trimmed, and true for empty keywords', () => {
    expect(matchesKeyword(['Ada Lovelace', 'ADM-001'], '  love ')).toBe(true);
    expect(matchesKeyword(['Ada Lovelace'], 'adm')).toBe(false);
    expect(matchesKeyword(['Ada'], '')).toBe(true);
  });
});
