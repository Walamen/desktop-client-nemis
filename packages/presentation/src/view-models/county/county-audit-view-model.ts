import type { CountyApplicationService } from '@nemis-desktop/application';
import type { CountyAuditLog, CountyAuditStats } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

const PAGE_SIZE = 50;

/** '' means "all" for the dropdowns and "no search" for the box. */
export interface CountyAuditFilters {
  readonly search: string;
  readonly action: string;
  readonly entityType: string;
}

export interface CountyAuditState {
  readonly stats: AsyncState<CountyAuditStats>;
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly filters: CountyAuditFilters;
  /** Every page loaded so far ("Load more" appends). */
  readonly items: readonly CountyAuditLog[];
  readonly total: number;
  readonly page: number;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
}

export interface CountyAuditViewModelDeps {
  readonly county: CountyApplicationService;
}

const blank = (value: string) => (value.trim() ? value.trim() : undefined);

/** County Audit Trail (offline): cards + filter options, and the timeline 50
 * at a time. A response from an earlier load (filters changed meanwhile) is
 * dropped, so a late "Load more" never lands in the new list. */
export class CountyAuditViewModel {
  readonly store = createStore<CountyAuditState>(() => ({
    stats: idleState(),
    status: 'idle',
    filters: { search: '', action: '', entityType: '' },
    items: [],
    total: 0,
    page: 1,
    hasMore: false,
    loadingMore: false,
  }));

  #request = 0;

  constructor(private readonly deps: CountyAuditViewModelDeps) {}

  async load(filters: CountyAuditFilters): Promise<void> {
    const request = ++this.#request;
    this.store.setState({ status: 'loading', filters, page: 1, loadingMore: false });
    await Promise.all([this.#loadStats(), this.#fetch(request, filters, 1, 'replace')]);
  }

  async loadMore(): Promise<void> {
    const { filters, page, hasMore, loadingMore } = this.store.getState();
    if (!hasMore || loadingMore) return;
    const request = this.#request;
    this.store.setState({ loadingMore: true });
    await this.#fetch(request, filters, page + 1, 'append');
    if (request === this.#request) this.store.setState({ loadingMore: false });
  }

  async #loadStats(): Promise<void> {
    await trackQuery({
      access: { get: () => this.store.getState().stats, set: (stats) => this.store.setState({ stats }) },
      fetch: () => this.deps.county.getAuditStats(),
      map: (stats) => stats,
    });
  }

  async #fetch(request: number, filters: CountyAuditFilters, page: number, mode: 'replace' | 'append'): Promise<void> {
    try {
      const res = await this.deps.county.listAuditLogs({
        page,
        limit: PAGE_SIZE,
        search: blank(filters.search),
        action: blank(filters.action),
        entityType: blank(filters.entityType),
      });
      if (request !== this.#request) return;
      const data = res.data;
      if (!data) {
        this.store.setState({ status: 'error' });
        return;
      }
      const existing = mode === 'append' ? this.store.getState().items : [];
      const seen = new Set(existing.map((r) => r.id));
      const items = [...existing, ...data.items.filter((r) => !seen.has(r.id))];
      this.store.setState({ status: 'ready', page, items, total: data.total, hasMore: items.length < data.total });
    } catch {
      if (request === this.#request) this.store.setState({ status: 'error' });
    }
  }
}
