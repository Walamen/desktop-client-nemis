import { beforeEach, describe, expect, it, vi } from 'vitest';

const listTeachers = vi.fn();
const listTeachingAssignments = vi.fn();
vi.mock('@/services/nemis-bridge/school-admin', () => ({
  schoolAdminBridge: { listTeachers: (...a: unknown[]) => listTeachers(...a), listTeachingAssignments: (...a: unknown[]) => listTeachingAssignments(...a) },
}));

import { getClassTeacherRoster } from './shared';

describe('getClassTeacherRoster (admin path)', () => {
  beforeEach(() => {
    listTeachers.mockReset();
    listTeachingAssignments.mockReset();
  });

  it('still sees a teacher assigned in a class outside the active year (all years, no activeYearOnly)', async () => {
    listTeachers.mockResolvedValue({ items: [{ id: 't-1', firstName: 'Martha', lastName: 'Doe' }], total: 1 });
    listTeachingAssignments.mockResolvedValue([
      { id: 'a-setup', teacherId: 't-1', classId: 'c-setup', academicYearId: 'ay-setup', subjectId: 'sub-1', subjectName: 'Math', isClassTeacher: false },
    ]);
    const roster = await getClassTeacherRoster('c-setup');
    expect(listTeachingAssignments).toHaveBeenCalledWith('t-1');
    expect(roster).toMatchObject([{ teacherId: 't-1', subjects: ['Math'], assignmentIds: ['a-setup'] }]);
  });
});
