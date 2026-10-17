import { describe, expect, it } from 'vitest';
import { createTestApplication } from '../../testing/create-test-application';
import { CountyStudentsViewModel } from './county-students-view-model';
import { CountyStudentDetailViewModel } from './county-student-detail-view-model';

describe('CountyStudentsViewModel', () => {
  it('passes the query through and keeps it in the store', async () => {
    const { app, ports } = createTestApplication();
    const vm = new CountyStudentsViewModel({ county: app.county });
    const query = { search: 'ada', status: 'active' as const, page: 2, limit: 12 };
    await vm.load(query);
    expect(ports.countyStudents.lastQuery).toEqual(query);
    expect(vm.store.getState().query).toEqual(query);
    expect(vm.store.getState().summary.status).toBe('success');
  });
});

describe('CountyStudentDetailViewModel', () => {
  it('records the requested id before loading; an unknown student is empty', async () => {
    const { app } = createTestApplication();
    const vm = new CountyStudentDetailViewModel({ county: app.county });
    expect(vm.store.getState().requestedId).toBeNull();
    const loading = vm.load('s-9');
    expect(vm.store.getState().requestedId).toBe('s-9');
    await loading;
    expect(vm.store.getState().detail.status).toBe('empty');
  });
});
