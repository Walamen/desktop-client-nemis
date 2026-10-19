import { describe, expect, it } from 'vitest';
import { createTestApplication } from '../../testing/create-test-application';
import { CountyUsersViewModel } from './county-users-view-model';
import { CountyUserOptionsViewModel } from './county-user-options-view-model';

describe('CountyUsersViewModel', () => {
  it('passes the query through and keeps it in the store', async () => {
    const { app, ports } = createTestApplication();
    const vm = new CountyUsersViewModel({ county: app.county });
    expect(vm.store.getState().query).toEqual({ page: 1, limit: 12 });
    const query = { search: 'ada', role: 'DEO' as const, page: 2, limit: 12 };
    await vm.load(query);
    expect(ports.countyUsers.lastQuery).toEqual(query);
    expect(vm.store.getState().query).toEqual(query);
    expect(vm.store.getState().summary.status).toBe('success');
  });

  it('reaches the error state when the read model throws', async () => {
    const { app, ports } = createTestApplication();
    ports.countyUsers.listUsers = () => {
      throw new Error('boom');
    };
    const vm = new CountyUsersViewModel({ county: app.county });
    await vm.load({ page: 1, limit: 12 });
    expect(vm.store.getState().summary.status).toBe('error');
  });
});

describe('CountyUserOptionsViewModel', () => {
  it('loads the options to success', async () => {
    const { app } = createTestApplication();
    const vm = new CountyUserOptionsViewModel({ county: app.county });
    expect(vm.store.getState().options.status).toBe('idle');
    await vm.load();
    expect(vm.store.getState().options.status).toBe('success');
  });

  it('reaches the error state when the read model throws', async () => {
    const { app, ports } = createTestApplication();
    ports.countyUsers.listOptions = () => {
      throw new Error('boom');
    };
    const vm = new CountyUserOptionsViewModel({ county: app.county });
    await vm.load();
    expect(vm.store.getState().options.status).toBe('error');
  });
});
