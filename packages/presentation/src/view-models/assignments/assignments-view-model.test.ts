import { describe, expect, it } from 'vitest';
import { AssignmentStatus, AssignmentType } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { AssignmentsViewModel } from './assignments-view-model';

function build() {
  const { app, ports } = createTestApplication();
  const notifications = new NotificationStore();
  const vm = new AssignmentsViewModel({ assignments: app.assignments, notifications });
  return { vm, notifications, ports };
}

const createDto = {
  classId: 'cls-1',
  teacherId: 'staff-1',
  title: 'Chapter 5 Homework',
  type: AssignmentType.HOMEWORK,
  status: AssignmentStatus.DRAFT,
  dueDate: '2026-08-10',
};

describe('AssignmentsViewModel', () => {
  it('creates an assignment and loads the (formatted) list', async () => {
    const { vm } = build();
    const outcome = await vm.createAssignment(createDto);
    expect(outcome.ok).toBe(true);
    const list = vm.store.getState().list;
    expect(list.status).toBe('success');
    if (list.status === 'success') {
      expect(list.data[0]?.title).toBe('Chapter 5 Homework');
      expect(list.data[0]?.status).toEqual({ label: 'Draft', badge: 'neutral' });
      expect(list.data[0]?.dueDate).toBe('10 Aug 2026');
    }
  });

  it('loadAssignments only returns the requesting teacher\'s assignments', async () => {
    const { vm } = build();
    await vm.createAssignment(createDto);
    await vm.createAssignment({ ...createDto, teacherId: 'staff-2' });
    await vm.loadAssignments('staff-1');
    const list = vm.store.getState().list;
    expect(list.status === 'success' && list.data).toHaveLength(1);
  });

  it('setFilters scopes the next loadAssignments call', async () => {
    const { vm } = build();
    await vm.createAssignment(createDto);
    await vm.createAssignment({ ...createDto, classId: 'cls-2' });
    vm.setFilters({ classId: 'cls-2' });
    await vm.loadAssignments('staff-1');
    const list = vm.store.getState().list;
    expect(list.status === 'success' && list.data).toHaveLength(1);
    expect(list.status === 'success' && list.data[0]?.classId).toBe('cls-2');
  });

  it('loadAssignment populates the detail view', async () => {
    const { vm } = build();
    const created = await vm.createAssignment(createDto);
    await vm.loadAssignment(created.ok ? created.data.id : '', 'staff-1');
    const detail = vm.store.getState().detail;
    expect(detail.status).toBe('success');
    if (detail.status === 'success') expect(detail.data.title).toBe('Chapter 5 Homework');
  });

  it('updateAssignment applies a partial patch and refreshes the list', async () => {
    const { vm } = build();
    const created = await vm.createAssignment(createDto);
    const id = created.ok ? created.data.id : '';
    const outcome = await vm.updateAssignment({ id, teacherId: 'staff-1', status: AssignmentStatus.ACTIVE });
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.data.status.label).toBe('Active');
    const detail = vm.store.getState().detail;
    expect(detail.status === 'success' && detail.data.status.label).toBe('Active');
  });

  it('deleteAssignment removes it from the list', async () => {
    const { vm, ports } = build();
    const created = await vm.createAssignment(createDto);
    const id = created.ok ? created.data.id : '';
    await vm.deleteAssignment({ id, teacherId: 'staff-1' });
    expect(ports.assignments.findById(id)).toBeNull();
  });

  it('gradeSubmission grades a synthesized PENDING row and refreshes the submissions list', async () => {
    const { vm, ports } = build();
    const created = await vm.createAssignment(createDto);
    const assignmentId = created.ok ? created.data.id : '';
    ports.assignmentSubmissions.enrolledStudentsByAssignment.set(assignmentId, [
      { studentId: 'stu-1', studentName: 'Ada Lovelace', nemisId: '482915736045' },
    ]);

    await vm.loadSubmissions(assignmentId, 'staff-1');
    const before = vm.store.getState().submissions;
    expect(before.status === 'success' && before.data[0]?.status.label).toBe('Pending');

    const graded = await vm.gradeSubmission({
      assignmentId,
      studentId: 'stu-1',
      teacherId: 'staff-1',
      grade: 92,
      feedback: 'Excellent',
    });
    expect(graded.ok).toBe(true);
    const after = vm.store.getState().submissions;
    expect(after.status === 'success' && after.data[0]?.status.label).toBe('Graded');
    expect(after.status === 'success' && after.data[0]?.grade).toBe(92);
  });

  it('rejects grading another teacher\'s assignment with an error notification', async () => {
    const { vm, notifications } = build();
    const created = await vm.createAssignment(createDto);
    const assignmentId = created.ok ? created.data.id : '';
    const outcome = await vm.gradeSubmission({
      assignmentId,
      studentId: 'stu-1',
      teacherId: 'someone-else',
      grade: 50,
    });
    expect(outcome.ok).toBe(false);
    expect(notifications.store.getState().notifications.at(-1)?.kind).toBe('error');
  });

  // These four cover the case where an assignment's id changed underneath a
  // page a teacher is already viewing (a background sync's first-push id
  // rewrite — see AssignmentSyncService.pushAssignment). The page's mutating
  // action fails against the now-stale id it's still holding; reloading on
  // that failure surfaces the same 'error' detail/submissions state a fresh
  // page load would, which is what drives the existing auto-redirect in
  // AssignmentDetailPage.tsx/AssignmentForm.tsx/SubmissionsTable.tsx.

  it('updateAssignment reloads the detail on failure, surfacing a stale id instead of leaving stale state behind', async () => {
    const { vm } = build();
    const outcome = await vm.updateAssignment({
      id: 'stale-id', teacherId: 'staff-1', status: AssignmentStatus.ACTIVE,
    });
    expect(outcome.ok).toBe(false);
    expect(vm.store.getState().detail.status).toBe('error');
  });

  it('deleteAssignment reloads the detail on failure, surfacing a stale id instead of leaving stale state behind', async () => {
    const { vm } = build();
    const outcome = await vm.deleteAssignment({ id: 'stale-id', teacherId: 'staff-1' });
    expect(outcome.ok).toBe(false);
    expect(vm.store.getState().detail.status).toBe('error');
  });

  it('gradeSubmission reloads the submissions list even when grading fails for a reason other than a stale id', async () => {
    const { vm, ports } = build();
    const created = await vm.createAssignment(createDto);
    const assignmentId = created.ok ? created.data.id : '';
    ports.assignmentSubmissions.enrolledStudentsByAssignment.set(assignmentId, [
      { studentId: 'stu-1', studentName: 'Ada Lovelace', nemisId: '482915736045' },
    ]);
    // A validation failure (negative grade), not an ownership/stale-id one —
    // the assignment genuinely still exists under this id for this teacher.
    const outcome = await vm.gradeSubmission({
      assignmentId, studentId: 'stu-1', teacherId: 'staff-1', grade: -5,
    });
    expect(outcome.ok).toBe(false);
    // So the reload succeeds and the table stays populated rather than being
    // wiped by the failed grade attempt.
    expect(vm.store.getState().submissions.status).toBe('success');
  });

  it('gradeSubmission surfaces a stale id when the assignment no longer exists under the held id', async () => {
    const { vm } = build();
    const outcome = await vm.gradeSubmission({
      assignmentId: 'stale-id', studentId: 'stu-1', teacherId: 'staff-1', grade: 50,
    });
    expect(outcome.ok).toBe(false);
    expect(vm.store.getState().submissions.status).toBe('error');
  });
});

describe('AssignmentsViewModel detail and submissions belong to one assignment', () => {
  async function twoAssignments() {
    const ctx = build();
    const a = await ctx.vm.createAssignment(createDto);
    const b = await ctx.vm.createAssignment({ ...createDto, title: 'Second' });
    if (!a.ok || !b.ok) throw new Error('setup failed');
    return { ...ctx, a: a.data.id, b: b.data.id };
  }

  it('drops the previous assignment detail at once and records whose it is', async () => {
    const { vm, a, b } = await twoAssignments();
    await vm.loadAssignment(a, 'staff-1');
    expect(vm.store.getState().detailFor).toBe(a);
    const pending = vm.loadAssignment(b, 'staff-1');
    expect(vm.store.getState().detailFor).toBe(b);
    expect(vm.store.getState().detail.status).toBe('loading');
    await pending;
    const detail = vm.store.getState().detail;
    expect(detail.status === 'success' && detail.data.id).toBe(b);
  });

  it('ignores an earlier detail response that lands after the later one', async () => {
    const { vm, a, b } = await twoAssignments();
    const query = (vm as unknown as { getQuery: { execute: (i: { id: string; teacherId: string }) => Promise<unknown> } }).getQuery;
    const real = query.execute.bind(query);
    const releases: Record<string, () => void> = {};
    query.execute = (input) => new Promise((resolve) => { releases[input.id] = () => resolve(real(input)); });
    const first = vm.loadAssignment(a, 'staff-1');
    const second = vm.loadAssignment(b, 'staff-1');
    releases[b]!();
    await second;
    releases[a]!();
    await first;
    const detail = vm.store.getState().detail;
    expect(vm.store.getState().detailFor).toBe(b);
    expect(detail.status === 'success' && detail.data.id).toBe(b);
  });

  /** Holds the detail query for `held` until released; every other id goes straight through. */
  function holdDetail(vm: AssignmentsViewModel, held: string) {
    const query = (vm as unknown as { getQuery: { execute: (i: { id: string; teacherId: string }) => Promise<unknown> } }).getQuery;
    const real = query.execute.bind(query);
    const calls: string[] = [];
    let release: () => void = () => undefined;
    query.execute = (input) => {
      calls.push(input.id);
      return input.id === held ? new Promise((resolve) => (release = () => resolve(real(input)))) : real(input);
    };
    return { calls, release: () => release() };
  }

  /** Replaces a command with one that fails once `finish` is called. */
  function holdFailure(vm: AssignmentsViewModel, command: 'updateCommand' | 'deleteCommand' | 'gradeCommand') {
    let finish: () => void = () => undefined;
    (vm as unknown as Record<string, { execute: () => Promise<unknown> }>)[command] = {
      execute: () =>
        new Promise((resolve) => (finish = () => resolve({ ok: false, error: { code: 'X', message: 'refused' } }))),
    };
    return () => finish();
  }

  for (const [label, command, run] of [
    ['update', 'updateCommand', (vm: AssignmentsViewModel, id: string) => vm.updateAssignment({ id, teacherId: 'staff-1', title: 'x' } as never)],
    ['delete', 'deleteCommand', (vm: AssignmentsViewModel, id: string) => vm.deleteAssignment({ id, teacherId: 'staff-1' } as never)],
  ] as const) {
    it(`a failed ${label} of A finishing after B opened leaves B's detail to land`, async () => {
      const { vm, a, b } = await twoAssignments();
      await vm.loadAssignment(a, 'staff-1');
      const finish = holdFailure(vm, command);
      const held = holdDetail(vm, b);
      const mutation = run(vm, a);
      const loadB = vm.loadAssignment(b, 'staff-1');
      finish();
      await mutation;
      held.release();
      await loadB;
      const detail = vm.store.getState().detail;
      expect(vm.store.getState().detailFor).toBe(b);
      expect(detail.status === 'success' && detail.data.id).toBe(b);
      expect(held.calls).not.toContain(a);
    });
  }

  it("a successful update of A finishing after B opened does not write A's detail into B's slot", async () => {
    const { vm, a, b } = await twoAssignments();
    await vm.loadAssignment(a, 'staff-1');
    const command = (vm as unknown as { updateCommand: { execute: (d: unknown) => Promise<unknown> } }).updateCommand;
    const real = command.execute.bind(command);
    let finish: () => void = () => undefined;
    command.execute = (dto) => new Promise((resolve) => (finish = () => resolve(real(dto))));
    const held = holdDetail(vm, b);
    const mutation = vm.updateAssignment({ id: a, teacherId: 'staff-1', title: 'Renamed' } as never);
    const loadB = vm.loadAssignment(b, 'staff-1');
    finish();
    await mutation;
    expect(vm.store.getState().detail.status).toBe('loading');
    held.release();
    await loadB;
    const detail = vm.store.getState().detail;
    expect(detail.status === 'success' && detail.data.id).toBe(b);
  });

  it('a failed update of the assignment shown still reloads it', async () => {
    const { vm, a } = await twoAssignments();
    await vm.loadAssignment(a, 'staff-1');
    const finish = holdFailure(vm, 'updateCommand');
    const held = holdDetail(vm, 'none');
    const mutation = vm.updateAssignment({ id: a, teacherId: 'staff-1', title: 'x' } as never);
    finish();
    await mutation;
    expect(held.calls).toEqual([a]);
  });

  it("grading on A finishing after B's submissions opened leaves B's rows to land", async () => {
    const { vm, a, b } = await twoAssignments();
    await vm.loadSubmissions(a, 'staff-1');
    const finish = holdFailure(vm, 'gradeCommand');
    const query = (vm as unknown as { listSubmissionsQuery: { execute: (i: { assignmentId: string; teacherId: string }) => Promise<unknown> } }).listSubmissionsQuery;
    const real = query.execute.bind(query);
    const calls: string[] = [];
    let releaseB: () => void = () => undefined;
    query.execute = (input) => {
      calls.push(input.assignmentId);
      return input.assignmentId === b ? new Promise((resolve) => (releaseB = () => resolve(real(input)))) : real(input);
    };
    const mutation = vm.gradeSubmission({ assignmentId: a, teacherId: 'staff-1', submissionId: 'sub-1' } as never);
    const loadB = vm.loadSubmissions(b, 'staff-1');
    finish();
    await mutation;
    releaseB();
    await loadB;
    expect(vm.store.getState().submissionsFor).toBe(b);
    expect(vm.store.getState().submissions.status).not.toBe('loading');
    expect(calls).not.toContain(a);
  });

  it('drops the previous assignment submissions at once and records whose they are', async () => {
    const { vm, a, b } = await twoAssignments();
    await vm.loadSubmissions(a, 'staff-1');
    expect(vm.store.getState().submissionsFor).toBe(a);
    const pending = vm.loadSubmissions(b, 'staff-1');
    expect(vm.store.getState().submissionsFor).toBe(b);
    expect(vm.store.getState().submissions.status).toBe('loading');
    await pending;
  });
});
