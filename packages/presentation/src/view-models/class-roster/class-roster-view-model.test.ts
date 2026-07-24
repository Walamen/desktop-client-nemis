import { describe, expect, it } from 'vitest';
import { AcademicYear, Class, Term } from '@nemis-desktop/domain';
import { AcademicYearStatus, Gender, GradeLevel } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { ClassRosterViewModel } from './class-roster-view-model';

async function build() {
  const { app, ports } = createTestApplication();
  ports.academicYears.store.set(
    'ay-1',
    AcademicYear.reconstitute({
      id: 'ay-1',
      institutionId: 'inst-1',
      code: '2025/2026',
      start: '2025-09-01',
      end: '2026-07-31',
      isCurrent: true,
      status: AcademicYearStatus.ACTIVE,
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  ports.terms.store.set(
    'term-1',
    Term.reconstitute({
      id: 'term-1',
      academicYearId: 'ay-1',
      name: 'Term 1',
      start: '2025-09-01',
      end: '2025-12-19',
      isCurrent: true,
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  ports.classes.store.set(
    'cls-1',
    Class.reconstitute({
      id: 'cls-1',
      institutionId: 'inst-1',
      academicYearId: 'ay-1',
      name: 'Grade 1 A',
      gradeLevel: GradeLevel.GRADE_1,
      isActive: true,
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  const student = await app.students.create({
    institutionId: 'inst-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    admissionNumber: 'ADM-001',
    dateOfBirth: '2015-06-01',
    gender: Gender.FEMALE,
  });
  const notifications = new NotificationStore();
  const vm = new ClassRosterViewModel({ academics: app.academics, notifications });
  return { app, vm, notifications, studentId: student.data.id };
}

const enrollDto = (studentId: string) => ({
  studentId,
  classId: 'cls-1',
  academicYearId: 'ay-1',
  termId: 'term-1',
});

describe('ClassRosterViewModel', () => {
  it('shows an empty roster, then an active enrollment after enrolling', async () => {
    const { vm, studentId } = await build();
    await vm.loadRoster('cls-1');
    expect(vm.store.getState().roster.status).toBe('empty');

    const outcome = await vm.enrollStudent(enrollDto(studentId));
    expect(outcome.ok).toBe(true);
    const roster = vm.store.getState().roster;
    expect(roster.status).toBe('success');
    if (roster.status === 'success') {
      expect(roster.data.activeCount).toBe(1);
      expect(roster.data.enrollments[0]?.status.label).toBe('Active');
    }
  });

  it('withdrawEnrollment refreshes the roster with the withdrawn status', async () => {
    const { vm, studentId } = await build();
    const enrolled = await vm.enrollStudent(enrollDto(studentId));
    if (!enrolled.ok) throw new Error('enroll failed');
    const outcome = await vm.withdrawEnrollment({
      enrollmentId: enrolled.data.id,
      actorId: 'usr-1',
    });
    expect(outcome.ok).toBe(true);
    const roster = vm.store.getState().roster;
    if (roster.status === 'success') {
      expect(roster.data.activeCount).toBe(0);
      expect(roster.data.enrollments[0]?.status.label).toBe('Withdrawn');
    } else {
      throw new Error(`expected success, got ${roster.status}`);
    }
  });

  it('duplicate enrollment fails with an error notification', async () => {
    const { vm, notifications, studentId } = await build();
    await vm.enrollStudent(enrollDto(studentId));
    const outcome = await vm.enrollStudent(enrollDto(studentId));
    expect(outcome.ok).toBe(false);
    const kinds = notifications.store.getState().notifications.map((n) => n.kind);
    expect(kinds).toContain('error');
    expect(vm.store.getState().submission).toBe('failed');
  });
});
