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

describe('TeachersViewModel assignment mutations refresh only the teacher still shown', () => {
  function withMutations() {
    let finishMutation: () => void = () => undefined;
    const releases: Record<string, () => void> = {};
    const calls = { profile: [] as string[], assignments: [] as string[] };
    const teachers = {
      getProfile: (id: string) => { calls.profile.push(id); return id === 'b' ? new Promise((r) => (releases.profileB = () => r({ data: person('b') }))) : Promise.resolve({ data: person(id) }); },
      getAssignments: (id: string) => { calls.assignments.push(id); return id === 'b' ? new Promise((r) => (releases.assignmentsB = () => r({ data: [{ id: 'xb' }] }))) : Promise.resolve({ data: [{ id: `x${id}` }] }); },
      dashboard: async () => ({ data: {} }),
      assign: () => new Promise((r) => (finishMutation = () => r({ data: { id: 'ta-1' } }))),
      updateAssignment: () => new Promise((r) => (finishMutation = () => r({ data: { id: 'ta-1' } }))),
      removeAssignment: () => new Promise((r) => (finishMutation = () => r({ data: { id: 'ta-1' } }))),
    };
    const vm = new TeachersViewModel({ teachers: teachers as never, notifications: new NotificationStore() });
    return { vm, calls, releases, finishMutation: () => finishMutation() };
  }

  const mutations = [
    ['assign', (vm: TeachersViewModel) => vm.assign({ teacherId: 'a' } as never)],
    ['updateAssignment', (vm: TeachersViewModel) => vm.updateAssignment({ assignmentId: 'ta-1' } as never, 'a')],
    ['removeAssignment', (vm: TeachersViewModel) => vm.removeAssignment('ta-1', 'a')],
  ] as const;

  for (const [label, run] of mutations) {
    it(`${label} for teacher A finishing after teacher B opened leaves B's profile and assignments to land`, async () => {
      const ctx = withMutations();
      await Promise.all([ctx.vm.loadProfile('a'), ctx.vm.loadAssignments('a')]);
      const mutation = run(ctx.vm);
      const loadB = Promise.all([ctx.vm.loadProfile('b'), ctx.vm.loadAssignments('b')]);
      ctx.finishMutation();
      await mutation;
      ctx.releases.profileB?.();
      ctx.releases.assignmentsB?.();
      await loadB;
      const s = ctx.vm.store.getState();
      expect(s.profileFor).toBe('b');
      expect(s.profile).toMatchObject({ status: 'success', data: { id: 'b' } });
      expect(s.assignmentsFor).toBe('b');
      expect(s.assignments).toMatchObject({ status: 'success', data: [{ id: 'xb' }] });
      expect(ctx.calls.profile.filter((id) => id === 'a')).toHaveLength(1);
      expect(ctx.calls.assignments.filter((id) => id === 'a')).toHaveLength(1);
    });
  }

  it('still refreshes the profile and assignments of the teacher shown', async () => {
    const ctx = withMutations();
    await Promise.all([ctx.vm.loadProfile('a'), ctx.vm.loadAssignments('a')]);
    const mutation = ctx.vm.assign({ teacherId: 'a' } as never);
    ctx.finishMutation();
    await mutation;
    expect(ctx.calls.profile.filter((id) => id === 'a')).toHaveLength(2);
    expect(ctx.calls.assignments.filter((id) => id === 'a')).toHaveLength(2);
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
