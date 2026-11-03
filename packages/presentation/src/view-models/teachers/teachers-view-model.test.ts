import { describe, expect, it } from 'vitest';
import { NotificationStore } from '../../stores/notification-store';
import { TeachersViewModel } from './teachers-view-model';

function build(handlers: {
  profile?: (id: string) => Promise<unknown>;
  assignments?: (id: string) => Promise<unknown>;
}) {
  const teachers = {
    getProfile: async (id: string) => ({ data: await handlers.profile?.(id) }),
    getAssignments: async (id: string) => ({ data: await handlers.assignments?.(id) }),
  };
  return new TeachersViewModel({ teachers: teachers as never, notifications: new NotificationStore() });
}

const person = (id: string) => ({ id, firstName: id, lastName: 'T', assignments: [] });

describe('TeachersViewModel profile belongs to one teacher', () => {
  it('drops the previous teacher at once and records whose profile it is', async () => {
    let release: (v: unknown) => void = () => undefined;
    const vm = build({ profile: (id) => (id === 'a' ? Promise.resolve(person('a')) : new Promise((r) => (release = r))) });
    await vm.loadProfile('a');
    expect(vm.store.getState().profileFor).toBe('a');
    expect(vm.store.getState().profile.status).toBe('success');
    const pending = vm.loadProfile('b');
    expect(vm.store.getState().profileFor).toBe('b');
    expect(vm.store.getState().profile.status).toBe('loading');
    release(person('b'));
    await pending;
    expect(vm.store.getState().profile).toMatchObject({ status: 'success', data: { id: 'b' } });
  });

  it('ignores an earlier teacher response that lands after the later one', async () => {
    const releases: Record<string, (v: unknown) => void> = {};
    const vm = build({ profile: (id) => new Promise((r) => (releases[id] = r)) });
    const a = vm.loadProfile('a');
    const b = vm.loadProfile('b');
    releases.b?.(person('b'));
    await b;
    releases.a?.(person('a'));
    await a;
    expect(vm.store.getState().profileFor).toBe('b');
    expect(vm.store.getState().profile).toMatchObject({ status: 'success', data: { id: 'b' } });
  });
});

describe('TeachersViewModel assignments belong to one teacher', () => {
  it('drops the previous teacher rows at once and records whose they are', async () => {
    let release: (v: unknown) => void = () => undefined;
    const vm = build({ assignments: (id) => (id === 'a' ? Promise.resolve([{ id: 'xa' }]) : new Promise((r) => (release = r))) });
    await vm.loadAssignments('a');
    expect(vm.store.getState().assignmentsFor).toBe('a');
    const pending = vm.loadAssignments('b');
    expect(vm.store.getState().assignmentsFor).toBe('b');
    expect(vm.store.getState().assignments.status).toBe('loading');
    release([{ id: 'xb' }]);
    await pending;
    expect(vm.store.getState().assignments).toMatchObject({ status: 'success', data: [{ id: 'xb' }] });
  });

  it('ignores an earlier teacher response that lands after the later one', async () => {
    const releases: Record<string, (v: unknown) => void> = {};
    const vm = build({ assignments: (id) => new Promise((r) => (releases[id] = r)) });
    const a = vm.loadAssignments('a');
    const b = vm.loadAssignments('b');
    releases.b?.([{ id: 'xb' }]);
    await b;
    releases.a?.([{ id: 'xa' }]);
    await a;
    expect(vm.store.getState().assignmentsFor).toBe('b');
    expect(vm.store.getState().assignments).toMatchObject({ status: 'success', data: [{ id: 'xb' }] });
  });
});
