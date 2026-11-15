import { describe, expect, it } from 'vitest';
import type { DeoApplicationService } from '@nemis-desktop/application';
import { createTestApplication } from '../../testing/create-test-application';
import { DeoTeachersViewModel } from './deo-teachers-view-model';
import { TEACHER_TABS, filterTeachersByTab, groupTeachersBySchool, teacherTabCounts } from './deo-teachers-views';

const t = (
  id: string,
  schoolId: string,
  overrides: Partial<{ gradesStatus: string; pendingApproval: boolean; unassigned: boolean; subjects: string[] }> = {},
) => ({
  id,
  schoolId,
  schoolName: schoolId === 's-1' ? 'Alpha' : 'Beta',
  gradesStatus: 'Submitted',
  pendingApproval: false,
  unassigned: false,
  subjects: [] as string[],
  ...overrides,
});
const teachers = [
  t('a', 's-2', { gradesStatus: 'Pending', subjects: ['Math', 'English'] }),
  t('b', 's-1', { pendingApproval: true, subjects: ['Science'] }),
  t('c', 's-1', { unassigned: true }),
  t('d', 's-2', { subjects: ['Math', 'History', 'Art'] }),
];

describe('teacher monitoring helpers', () => {
  it('counts and filters the four tabs', () => {
    expect(TEACHER_TABS).toEqual(['All', 'Grades Pending', 'Pending Approval', 'Unassigned']);
    expect(teacherTabCounts(teachers)).toEqual({ All: 4, 'Grades Pending': 1, 'Pending Approval': 1, Unassigned: 1 });
    expect(filterTeachersByTab(teachers, 'Grades Pending').map((x) => x.id)).toEqual(['a']);
  });

  it('groups by school with distinct subjects and a status, as the web does', () => {
    expect(groupTeachersBySchool(teachers)).toEqual([
      {
        schoolId: 's-1',
        schoolName: 'Alpha',
        teacherCount: 2,
        gradesPending: 0,
        pendingApproval: 1,
        unassigned: 1,
        subjects: ['Science'],
        needsAttention: true,
      },
      {
        schoolId: 's-2',
        schoolName: 'Beta',
        teacherCount: 2,
        gradesPending: 1,
        pendingApproval: 0,
        unassigned: 0,
        subjects: ['Art', 'English', 'History', 'Math'],
        needsAttention: true,
      },
    ]);
    expect(groupTeachersBySchool([t('x', 's-1')])[0]!.needsAttention).toBe(false);
  });
});

describe('DeoTeachersViewModel', () => {
  it('loads the teachers of the signed-in officer', async () => {
    const { app } = createTestApplication();
    const vm = new DeoTeachersViewModel({ deo: app.deo });
    const loading = vm.load();
    expect(vm.store.getState().teachers.status).toBe('loading');
    await loading;
    expect(vm.store.getState().teachers.status).toBe('success');
  });

  it('moves to error when the service fails', async () => {
    const failing = {
      listTeachers: async () => {
        throw new Error('database locked');
      },
    } as unknown as DeoApplicationService;
    const vm = new DeoTeachersViewModel({ deo: failing });
    await vm.load();
    expect(vm.store.getState().teachers.status).toBe('error');
  });
});
