import type { CountyApplicationService } from '@nemis-desktop/application';
import type { CountyNotification, CountyNotificationsFilter } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';

const PAGE_SIZE = 20;

export interface CountyNotificationsState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly filter: CountyNotificationsFilter;
  readonly page: number;
  /** Every page loaded so far ("Load more" appends). */
  readonly items: readonly CountyNotification[];
  readonly total: number;
  readonly totalAll: number;
  readonly unread: number;
  readonly alertsUnresolved: number;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
}

export interface CountyNotificationsViewModelDeps {
  readonly county: CountyApplicationService;
}

/** County Notifications page: 20 per page with Load more; marking read
 * updates the list in place and refreshes the counts. */
export class CountyNotificationsViewModel {
  readonly store = createStore<CountyNotificationsState>(() => ({
    status: 'idle',
    filter: 'ALL',
    page: 1,
    items: [],
    total: 0,
    totalAll: 0,
    unread: 0,
    alertsUnresolved: 0,
    hasMore: false,
    loadingMore: false,
  }));

  constructor(private readonly deps: CountyNotificationsViewModelDeps) {}

  async load(filter: CountyNotificationsFilter): Promise<void> {
    this.store.setState({ status: 'loading', filter, page: 1 });
    await this.#fetch(filter, 1, 'replace');
  }

  async loadMore(): Promise<void> {
    const { filter, page, hasMore, loadingMore } = this.store.getState();
    if (!hasMore || loadingMore) return;
    this.store.setState({ loadingMore: true });
    await this.#fetch(filter, page + 1, 'append');
    this.store.setState({ loadingMore: false });
  }

  async markRead(notificationId: string): Promise<void> {
    await this.deps.county.markNotificationRead(notificationId);
    this.#markLocally((n) => n.id === notificationId);
    await this.#refreshCounts();
  }

  async markAllRead(): Promise<void> {
    await this.deps.county.markAllNotificationsRead();
    this.#markLocally(() => true);
    await this.#refreshCounts();
  }

  #markLocally(match: (n: CountyNotification) => boolean): void {
    const { items, filter } = this.store.getState();
    const next = items.map((n) => (match(n) ? { ...n, isRead: true } : n));
    // Under "Unread" a read notification no longer belongs in the list.
    this.store.setState({ items: filter === 'UNREAD' ? next.filter((n) => !n.isRead) : next });
  }

  async #refreshCounts(): Promise<void> {
    const { filter } = this.store.getState();
    const res = await this.deps.county.listNotifications({ filter, page: 1, limit: PAGE_SIZE });
    if (!res.data) return;
    const { total, totalAll, unread, alertsUnresolved } = res.data;
    this.store.setState({
      total,
      totalAll,
      unread,
      alertsUnresolved,
      hasMore: this.store.getState().items.length < total,
    });
  }

  async #fetch(filter: CountyNotificationsFilter, page: number, mode: 'replace' | 'append'): Promise<void> {
    try {
      const res = await this.deps.county.listNotifications({ filter, page, limit: PAGE_SIZE });
      if (this.store.getState().filter !== filter) return;
      const data = res.data;
      if (!data) {
        this.store.setState({ status: 'error' });
        return;
      }
      const existing = mode === 'append' ? this.store.getState().items : [];
      const seen = new Set(existing.map((n) => n.id));
      const items = [...existing, ...data.items.filter((n) => !seen.has(n.id))];
      this.store.setState({
        status: 'ready',
        page,
        items,
        total: data.total,
        totalAll: data.totalAll,
        unread: data.unread,
        alertsUnresolved: data.alertsUnresolved,
        hasMore: items.length < data.total,
      });
    } catch {
      this.store.setState({ status: 'error' });
    }
  }
}
