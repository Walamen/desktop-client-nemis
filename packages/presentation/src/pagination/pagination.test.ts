import { describe, expect, it } from 'vitest';
import {
  createPagination,
  toPageRequest,
  totalPages,
  withPage,
  withPageSize,
  withSort,
  withTotal,
} from './pagination';

describe('pagination', () => {
  it('creates 1-based defaults and converts to PageRequest', () => {
    const p = createPagination();
    expect(p).toEqual({ page: 1, pageSize: 25, totalCount: 0, sort: null });
    expect(toPageRequest(p)).toEqual({ limit: 25, offset: 0 });
    expect(toPageRequest(withPage(withTotal(p, 100), 3))).toEqual({ limit: 25, offset: 50 });
  });

  it('computes totalPages with a minimum of 1', () => {
    expect(totalPages(createPagination())).toBe(1);
    expect(totalPages(withTotal(createPagination(), 51))).toBe(3);
  });

  it('clamps page into range', () => {
    const p = withTotal(createPagination(), 30); // 2 pages
    expect(withPage(p, 0).page).toBe(1);
    expect(withPage(p, 99).page).toBe(2);
  });

  it('withPageSize resets to page 1 and withTotal clamps the current page down', () => {
    const p = withPage(withTotal(createPagination(), 100), 4);
    expect(withPageSize(p, 50)).toMatchObject({ page: 1, pageSize: 50 });
    expect(withTotal(p, 10).page).toBe(1);
  });

  it('withSort replaces the sort spec', () => {
    const sorted = withSort(createPagination(), { field: 'fullName', direction: 'desc' });
    expect(sorted.sort).toEqual({ field: 'fullName', direction: 'desc' });
    expect(withSort(sorted, null).sort).toBeNull();
  });
});
