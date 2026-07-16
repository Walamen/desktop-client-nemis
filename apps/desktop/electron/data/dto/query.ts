import type { SortDirection } from '../queries/builders';

export interface SortSpec {
  column: string;
  direction: SortDirection;
}

export interface PageRequest {
  limit: number;
  offset: number;
}

export interface QueryOptions {
  orderBy?: readonly SortSpec[];
  page?: PageRequest;
}

/** Like QueryOptions, but a page is mandatory (used by findPage). */
export interface PageOptions {
  orderBy?: readonly SortSpec[];
  page: PageRequest;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
