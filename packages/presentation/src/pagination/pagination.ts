import type { PageRequest } from '@nemis-desktop/application';
import { DEFAULT_PAGE_SIZE } from '../constants/defaults';

export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  readonly field: string;
  readonly direction: SortDirection;
}

/** Immutable pagination state; `page` is 1-based for display. */
export interface PaginationState {
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly sort: SortSpec | null;
}

export function createPagination(pageSize = DEFAULT_PAGE_SIZE): PaginationState {
  return { page: 1, pageSize, totalCount: 0, sort: null };
}

export function toPageRequest(p: PaginationState): PageRequest {
  return { limit: p.pageSize, offset: (p.page - 1) * p.pageSize };
}

export function totalPages(p: PaginationState): number {
  return Math.max(1, Math.ceil(p.totalCount / p.pageSize));
}

export function withPage(p: PaginationState, page: number): PaginationState {
  return { ...p, page: Math.min(Math.max(1, page), totalPages(p)) };
}

export function withPageSize(p: PaginationState, pageSize: number): PaginationState {
  return { ...p, pageSize, page: 1 };
}

export function withTotal(p: PaginationState, totalCount: number): PaginationState {
  const next = { ...p, totalCount };
  return { ...next, page: Math.min(next.page, totalPages(next)) };
}

export function withSort(p: PaginationState, sort: SortSpec | null): PaginationState {
  return { ...p, sort };
}
