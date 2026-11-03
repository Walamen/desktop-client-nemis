import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { mockSearch } from '@/test-utils/search-params';
import { useQueryParam } from './use-query-param';

vi.mock('next/navigation', async () => (await import('@/test-utils/search-params')).navigationMock);

describe('useQueryParam', () => {
  it('returns the value of the named key', () => {
    mockSearch('id=co-1');
    expect(renderHook(() => useQueryParam('id')).result.current).toBe('co-1');
  });

  it("returns '' when the key is absent", () => {
    mockSearch('other=x');
    expect(renderHook(() => useQueryParam('id')).result.current).toBe('');
  });
});
