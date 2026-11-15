import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryDistrictOverviewReadModel } from '../../testing/deo/in-memory-district-overview';
import { GetDeoStudentsUseCase } from './get-deo-students';

const NOW = '2026-11-16T12:00:00.000Z';

/** Schools by name. Rates: fine 95, low 72, lower 40, silent 90, empty 10;
 * flagged has no attendance during a running term (Flagged, No Data). */
function district() {
  const readModel = new InMemoryDistrictOverviewReadModel();
  readModel.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
  readModel.county = { id: 'c-1', name: 'Grand Bassa' };
  const ids = ['empty', 'fine', 'flagged', 'low', 'lower', 'silent'];
  readModel.schools = ids.map((id) => ({
    id,
    name: `School ${id}`,
    code: id.toUpperCase(),
    levels: id === 'low' ? ['PRIMARY', 'JUNIOR_HIGH'] : ['PRIMARY'],
    metadataPrincipal: null,
  }));
  readModel.studentsBySchool = ids.map((id) => ({ institutionId: id, count: id === 'empty' ? 0 : 10 }));
  readModel.teachersBySchool = ids.map((id) => ({ institutionId: id, count: 2 }));
  const attended: Record<string, number> = { fine: 95, low: 72, lower: 40, silent: 90, empty: 10 };
  readModel.attendance = Object.entries(attended).map(([institutionId, n]) => ({
    institutionId,
    records: 100,
    attended: n,
  }));
  readModel.lastAttendance = Object.keys(attended).map((institutionId) => ({ institutionId, date: '2026-11-16' }));
  readModel.termSchools = ['flagged'];
  readModel.lastSubmissions = ids
    .filter((id) => id !== 'silent')
    .map((institutionId) => ({ institutionId, submittedAt: '2026-11-01T00:00:00.000Z' }));
  readModel.studentsByGender = [
    { gender: 'MALE', count: 32 },
    { gender: 'FEMALE', count: 18 },
  ];
  readModel.atRiskStudents = [
    { institutionId: 'lower', count: 6 },
    { institutionId: 'low', count: 2 },
  ];
  return readModel;
}

function run(readModel: InMemoryDistrictOverviewReadModel, districtId: string | null = 'd-1') {
  return new GetDeoStudentsUseCase({
    readModel,
    finance: { listSchools: () => [] },
    currentDistrictId: districtId,
    clock: new FixedClock(NOW),
    logger: new RecordingLogger(),
  }).execute({});
}

describe('GetDeoStudentsUseCase', () => {
  it('names the district and sums enrolment with the gender split', async () => {
    const { data } = await run(district());
    expect(data.district).toEqual({ id: 'd-1', name: 'Buchanan' });
    expect(data.county).toEqual({ id: 'c-1', name: 'Grand Bassa' });
    expect(data.summary).toMatchObject({ totalEnrollment: 50, male: 32, female: 18 });
    expect(data.genderDistribution).toEqual({ male: 32, female: 18 });
    expect(data.enrollmentTrend).toHaveLength(6);
    expect(data.enrollmentTrend.at(-1)).toEqual({ period: 'Nov 2026', enrollment: 50 });
  });

  it('weights average attendance by records over the 30-day window, null with none', async () => {
    const readModel = district();
    const { data } = await run(readModel);
    expect(data.summary.avgAttendance).toBe(61); // 307 of 500
    expect(readModel.argsOf('countAtRiskStudentsBySchool')).toEqual(['d-1', '2026-10-17']);
    const empty = district();
    empty.attendance = [];
    expect((await run(empty)).data.summary.avgAttendance).toBeNull();
  });

  it('lists every school with its levels, standing and last submission, by name', async () => {
    const { data } = await run(district());
    expect(data.schools.map((s) => [s.id, s.attendanceRate, s.performanceStatus])).toEqual([
      ['empty', 10, 'Critical'],
      ['fine', 95, 'Good'],
      ['flagged', null, 'No Data'],
      ['low', 72, 'Warning'],
      ['lower', 40, 'Critical'],
      ['silent', 90, 'Good'],
    ]);
    expect(data.schools[3]).toEqual({
      id: 'low',
      name: 'School low',
      code: 'LOW',
      levels: ['PRIMARY', 'JUNIOR_HIGH'],
      students: 10,
      teachers: 2,
      attendanceRate: 72,
      lastSubmissionAt: '2026-11-01T00:00:00.000Z',
      performanceStatus: 'Warning',
    });
  });

  it('alerts on schools with pupils that are low, flagged or never reported, worst first, no-data last', async () => {
    const { data } = await run(district());
    expect(data.dropoutAlerts.map((a) => [a.schoolId, a.reason, a.atRiskStudents])).toEqual([
      ['lower', 'Attendance is 40%', 6],
      ['low', 'Attendance is 72%', 2],
      ['silent', 'No report submitted yet', 0],
      ['flagged', 'Flagged in district monitoring', 0],
    ]);
    expect(data.dropoutAlerts[0]).toMatchObject({ schoolName: 'School lower', attendanceRate: 40 });
  });

  it('reads nothing when no district is assigned', async () => {
    const readModel = district();
    const { data } = await run(readModel, null);
    expect(data).toEqual({
      districtId: null,
      district: null,
      county: null,
      summary: { totalEnrollment: 0, male: 0, female: 0, avgAttendance: null },
      enrollmentTrend: [],
      genderDistribution: { male: 0, female: 0 },
      schools: [],
      dropoutAlerts: [],
    });
    expect(readModel.calls).toEqual([]);
  });
});
