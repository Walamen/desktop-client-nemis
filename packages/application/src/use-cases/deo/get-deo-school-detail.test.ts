import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryDistrictOverviewReadModel } from '../../testing/deo/in-memory-district-overview';
import { InMemoryCountyReportsReadModel } from '../../testing/county/in-memory-county-reports-read-model';
import { GetDeoSchoolsUseCase } from './get-deo-schools';
import { GetDeoSchoolDetailUseCase } from './get-deo-school-detail';

const NOW = '2026-11-16T12:00:00.000Z';

function setup() {
  const readModel = new InMemoryDistrictOverviewReadModel();
  readModel.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
  readModel.county = { id: 'c-1', name: 'Grand Bassa' };
  readModel.schools = [
    { id: 's-1', name: 'Alpha', code: 'A1', levels: ['PRIMARY'], metadataPrincipal: 'Old Name' },
    { id: 's-2', name: 'Beta', code: 'B1', levels: [], metadataPrincipal: null },
  ];
  readModel.schoolAdmins = [{ institutionId: 's-1', name: 'Jallah Doe' }];
  readModel.schoolProfile = { address: '12 Main St', establishedYear: 1990 };
  readModel.schoolGender = [
    { gender: 'MALE', count: 2 },
    { gender: 'FEMALE', count: 1 },
    { gender: 'OTHER', count: 1 },
  ];
  readModel.schoolGrades = [
    { gradeLevel: 'GRADE_1', students: 3 },
    { gradeLevel: null, students: 1 },
  ];
  const reports = new InMemoryCountyReportsReadModel();
  return { readModel, reports };
}

function run(
  s: ReturnType<typeof setup>,
  schoolId = 's-1',
  districtId: string | null = 'd-1',
) {
  return new GetDeoSchoolDetailUseCase({
    readModel: s.readModel,
    finance: { listSchools: () => [] },
    reports: s.reports,
    currentDistrictId: districtId,
    clock: new FixedClock(NOW),
    logger: new RecordingLogger(),
  }).execute({ schoolId });
}

describe('GetDeoSchoolDetailUseCase', () => {
  it('returns nothing and reads no report when no district is assigned', async () => {
    const s = setup();
    const { data } = await run(s, 's-1', null);
    expect(data).toEqual({ districtId: null, school: null });
    expect(s.reports.lastAcademicQuery).toBeNull();
  });

  it('returns a null school for an id outside the district', async () => {
    const s = setup();
    const { data } = await run(s, 's-other');
    expect(data).toEqual({ districtId: 'd-1', school: null });
    expect(s.reports.lastAcademicQuery).toBeNull();
  });

  it('carries the same row the Schools page shows', async () => {
    const s = setup();
    const list = await new GetDeoSchoolsUseCase({
      readModel: s.readModel,
      finance: { listSchools: () => [] },
      currentDistrictId: 'd-1',
      clock: new FixedClock(NOW),
      logger: new RecordingLogger(),
    }).execute({});
    const row = list.data.schools.find((r) => r.id === 's-1');
    const { data } = await run(s);
    const { address, establishedYear, gender, enrollmentByGrade, academic, ...rest } = data.school!;
    void address;
    void establishedYear;
    void gender;
    void enrollmentByGrade;
    void academic;
    expect(rest).toEqual(row);
  });

  it('fills profile, gender and grade breakdown', async () => {
    const s = setup();
    const { data } = await run(s);
    expect(data.school?.address).toBe('12 Main St');
    expect(data.school?.establishedYear).toBe(1990);
    expect(data.school?.gender).toEqual({ male: 2, female: 1 });
    expect(data.school?.enrollmentByGrade).toEqual([
      { gradeLevel: 'GRADE_1', students: 3 },
      { gradeLevel: null, students: 1 },
    ]);
  });

  it('uses null profile fields when the school has no profile row', async () => {
    const s = setup();
    s.readModel.schoolProfile = null;
    const { data } = await run(s);
    expect(data.school?.address).toBeNull();
    expect(data.school?.establishedYear).toBeNull();
  });

  it('takes the average from the academic report, scoped to the school', async () => {
    const s = setup();
    s.reports.academic = {
      ...s.reports.academic,
      bySchool: [
        { schoolId: 's-1', totalGrades: 2, averageScore: 75 },
      ] as unknown as typeof s.reports.academic.bySchool,
    };
    const { data } = await run(s);
    expect(s.reports.lastAcademicQuery).toEqual({ districtId: 'd-1', schoolId: 's-1', districtOnly: true });
    expect(data.school?.academic).toEqual({ totalGrades: 2, averageScore: 75 });
  });

  it('gives a null average for zero grades or no row', async () => {
    const s = setup();
    s.reports.academic = {
      ...s.reports.academic,
      bySchool: [
        { schoolId: 's-1', totalGrades: 0, averageScore: 0 },
      ] as unknown as typeof s.reports.academic.bySchool,
    };
    expect((await run(s)).data.school?.academic).toEqual({ totalGrades: 0, averageScore: null });
    s.reports.academic = { ...s.reports.academic, bySchool: [] };
    expect((await run(s)).data.school?.academic).toEqual({ totalGrades: 0, averageScore: null });
  });
});
