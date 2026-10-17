import { describe, expect, it } from 'vitest';
import type { SchoolRegistrationInput } from '@nemis-desktop/types';
import { createTestApplication } from '../../testing/create-test-application';
import { NotificationStore } from '../../stores/notification-store';
import { CountySchoolRegistrationViewModel } from './county-school-registration-view-model';

const school: SchoolRegistrationInput = {
  name: 'Alpha School',
  type: 'SCHOOL',
  levels: ['PRIMARY'],
  ownership: 'GOVERNMENT',
  districtId: 'd-1',
  isActive: true,
  admins: [{ email: 'ada@school.lr', firstName: 'Ada', lastName: 'Doe' }],
};

function setup() {
  const { app, ports } = createTestApplication();
  ports.schoolRegistrations.county = { id: 'c-1', name: 'Grand Bassa', code: 'GB' };
  ports.schoolRegistrations.districts = [{ id: 'd-1', name: 'Buchanan' }];
  const notifications = new NotificationStore();
  const vm = new CountySchoolRegistrationViewModel({ county: app.county, notifications });
  return { vm, ports, notifications };
}

describe('CountySchoolRegistrationViewModel', () => {
  it('register forwards and returns the result without a success toast', async () => {
    const { vm, ports, notifications } = setup();
    const result = await vm.register({ source: 'form', schools: [{ ...school, emisCode: 'LR-0042' }] });
    expect(result).toMatchObject({ status: 'saved' });
    expect(ports.schoolRegistrations.rows).toHaveLength(1);
    expect(notifications.store.getState().notifications).toEqual([]);
    expect(vm.store.getState().submitting).toBe(false);
  });

  it('a second register while the first is in flight is ignored', async () => {
    const { vm, ports } = setup();
    const first = vm.register({ source: 'bulk', schools: [school] });
    const second = vm.register({ source: 'bulk', schools: [school] });
    expect(await second).toBeNull();
    expect(await first).toMatchObject({ status: 'saved' });
    expect(ports.schoolRegistrations.rows).toHaveLength(1);
  });

  it('a failure shows an error toast and returns null', async () => {
    const { vm, ports, notifications } = setup();
    ports.schoolRegistrations.insertMany = () => {
      throw new Error('disk full');
    };
    expect(await vm.register({ source: 'bulk', schools: [school] })).toBeNull();
    expect(notifications.store.getState().notifications.map((n) => n.kind)).toEqual(['error']);
    expect(vm.store.getState().submitting).toBe(false);
  });

  it('loadContext and loadRegistration fill their states; an unknown id is empty', async () => {
    const { vm } = setup();
    await vm.loadContext();
    expect(vm.store.getState().context).toMatchObject({ status: 'success', data: { county: { code: 'GB' } } });
    const saved = await vm.register({ source: 'bulk', schools: [school] });
    const id = saved && saved.status === 'saved' ? saved.ids[0]! : '';
    await vm.loadRegistration(id);
    expect(vm.store.getState().registration).toMatchObject({ status: 'success', data: { id, syncState: 'pending' } });
    await vm.loadRegistration('nope');
    expect(vm.store.getState().registration.status).toBe('empty');
  });

  it('discard and states forward to the service', async () => {
    const { vm, ports } = setup();
    const saved = await vm.register({ source: 'bulk', schools: [school] });
    const id = saved && saved.status === 'saved' ? saved.ids[0]! : '';
    expect(await vm.discard(id)).toBe(false);
    ports.schoolRegistrations.rows[0]!.syncState = 'rejected';
    expect((await vm.states([id])).map((r) => r.syncState)).toEqual(['rejected']);
    expect(await vm.discard(id)).toBe(true);
    expect(await vm.states([])).toEqual([]);
  });
});
