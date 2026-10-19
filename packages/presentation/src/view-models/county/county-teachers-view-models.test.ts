import { describe, expect, it } from 'vitest';
import { createTestApplication } from '../../testing/create-test-application';
import { CountyTeachersViewModel } from './county-teachers-view-model';
import { CountyTeacherDetailViewModel } from './county-teacher-detail-view-model';

describe('CountyTeachersViewModel', () => {
  it('passes the query through and keeps it in the store', async () => {
    const { app, ports } = createTestApplication();
    const vm = new CountyTeachersViewModel({ county: app.county });
    const query = { search: 'musu', subject: 'English', status: 'active' as const, page: 2, limit: 12 };
    await vm.load(query);
    expect(ports.countyTeachers.lastQuery).toEqual(query);
    expect(vm.store.getState().query).toEqual(query);
    expect(vm.store.getState().summary.status).toBe('success');
  });
});

describe('CountyTeacherDetailViewModel', () => {
  it('records the requested id before loading; an unknown teacher is empty', async () => {
    const { app } = createTestApplication();
    const vm = new CountyTeacherDetailViewModel({ county: app.county });
    expect(vm.store.getState().requestedId).toBeNull();
    const loading = vm.load('t-9');
    expect(vm.store.getState().requestedId).toBe('t-9');
    await loading;
    expect(vm.store.getState().detail.status).toBe('empty');
  });
});
