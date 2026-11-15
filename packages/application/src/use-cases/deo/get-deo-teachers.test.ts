import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryDistrictOverviewReadModel } from '../../testing/deo/in-memory-district-overview';
import type { DistrictTeacherRow } from '../../interfaces/deo/district-overview-read-model';
import { GetDeoTeachersUseCase } from './get-deo-teachers';

function row(id: string, lastName: string, overrides: Partial<DistrictTeacherRow> = {}): DistrictTeacherRow {
  return {
    id,
    firstName: 'First',
    lastName,
    employeeNumber: `E-${id}`,
    schoolId: 's-1',
    schoolName: 'Alpha',
    approvalStatus: 'APPROVED',
    subjects: [],
    firstClassGrade: 'GRADE_1',
    unassigned: false,
    ownedAssessments: 0,
    ungradedAssessments: 0,
    ...overrides,
  };
}

function run(readModel: InMemoryDistrictOverviewReadModel, districtId: string | null = 'd-1') {
  return new GetDeoTeachersUseCase({
    readModel,
    currentDistrictId: districtId,
    clock: new FixedClock('2026-11-16T12:00:00.000Z'),
    logger: new RecordingLogger(),
  }).execute({});
}

describe('GetDeoTeachersUseCase', () => {
  it('derives subject, grade state and approval, ordered by name, with a summary', async () => {
    const model = new InMemoryDistrictOverviewReadModel();
    model.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
    model.teacherRows = [
      row('t-z', 'Zinnah', { subjects: ['English', 'Math'], ownedAssessments: 3, ungradedAssessments: 1 }),
      row('t-a', 'Akoi', { approvalStatus: 'PENDING', ownedAssessments: 2, ungradedAssessments: 0 }),
      row('t-m', 'Morris', { firstClassGrade: null, unassigned: true }),
    ];
    const { data } = await run(model);
    expect(data.district).toEqual({ id: 'd-1', name: 'Buchanan' });
    expect(data.teachers.map((t) => [t.lastName, t.leadSubject, t.gradesStatus, t.pendingApproval, t.unassigned])).toEqual([
      ['Akoi', 'GRADE_1', 'Submitted', true, false],
      ['Morris', 'General', 'No assessments', false, true],
      ['Zinnah', 'English', 'Pending', false, false],
    ]);
    expect(data.summary).toEqual({ totalTeachers: 3, gradesPending: 1, pendingApproval: 1, unassigned: 1 });
  });

  it('reads nothing when no district is assigned', async () => {
    const model = new InMemoryDistrictOverviewReadModel();
    const { data } = await run(model, null);
    expect(data).toEqual({
      districtId: null,
      district: null,
      county: null,
      teachers: [],
      summary: { totalTeachers: 0, gradesPending: 0, pendingApproval: 0, unassigned: 0 },
    });
    expect(model.calls).toEqual([]);
  });
});
