import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryCountyAnalyticsReadModel } from '../../testing/county/in-memory-county-analytics-read-model';
import { InMemoryCountyDistrictsReadModel } from '../../testing/county/in-memory-county-districts-read-model';
import { InMemoryCountyStudentsReadModel } from '../../testing/county/in-memory-county-students-read-model';
import { GetCountyStudentsUseCase } from './get-county-students';
import { GetCountyStudentDetailUseCase } from './get-county-student-detail';

describe('GetCountyStudentsUseCase', () => {
  it('listStudents adds the county and active districts to the read model page', async () => {
    const readModel = new InMemoryCountyStudentsReadModel();
    readModel.page = { ...readModel.page, total: 3, schools: [{ id: 's-1', name: 'Alpha' }] };
    const districtsReadModel = new InMemoryCountyDistrictsReadModel();
    districtsReadModel.districts = [
      { id: 'd-1', name: 'Buchanan', code: null, isActive: true, activeSchoolCount: 1, activeDeoCount: 0, firstDeo: null },
    ];
    const countyReadModel = new InMemoryCountyAnalyticsReadModel();
    countyReadModel.county = { id: 'county-1', name: 'Grand Bassa' };
    const query = { search: 'ada', page: 2, limit: 12 };

    const { data } = await new GetCountyStudentsUseCase({
      readModel,
      districtsReadModel,
      countyReadModel,
      logger: new RecordingLogger(),
    }).execute(query);

    expect(readModel.lastQuery).toEqual(query);
    expect(data).toEqual({
      ...readModel.page,
      county: { id: 'county-1', name: 'Grand Bassa' },
      districts: [{ id: 'd-1', name: 'Buchanan' }],
    });
  });
});

describe('GetCountyStudentDetailUseCase', () => {
  it('getStudent is null for a student not on the device', async () => {
    const { data } = await new GetCountyStudentDetailUseCase({
      readModel: new InMemoryCountyStudentsReadModel(),
      logger: new RecordingLogger(),
    }).execute({ studentId: 'nope' });
    expect(data).toBeNull();
  });
});
