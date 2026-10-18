import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryCountyAnalyticsReadModel } from '../../testing/county/in-memory-county-analytics-read-model';
import { InMemoryCountyTeachersReadModel } from '../../testing/county/in-memory-county-teachers-read-model';
import { GetCountyTeachersUseCase } from './get-county-teachers';
import { GetCountyTeacherDetailUseCase } from './get-county-teacher-detail';

describe('GetCountyTeachersUseCase', () => {
  it('listTeachers adds the county to the read model page', async () => {
    const readModel = new InMemoryCountyTeachersReadModel();
    readModel.page = {
      ...readModel.page,
      total: 3,
      stats: { total: 3, active: 2, inactive: 1, unassigned: 1, subjects: ['English'] },
    };
    const countyReadModel = new InMemoryCountyAnalyticsReadModel();
    countyReadModel.county = { id: 'county-1', name: 'Grand Bassa' };
    const query = { search: 'musu', subject: 'English', page: 2, limit: 12 };

    const { data } = await new GetCountyTeachersUseCase({
      readModel,
      countyReadModel,
      logger: new RecordingLogger(),
    }).execute(query);

    expect(readModel.lastQuery).toEqual(query);
    expect(data).toEqual({ ...readModel.page, county: { id: 'county-1', name: 'Grand Bassa' } });
  });
});

describe('GetCountyTeacherDetailUseCase', () => {
  it('getTeacher is null for a teacher not on the device', async () => {
    const { data } = await new GetCountyTeacherDetailUseCase({
      readModel: new InMemoryCountyTeachersReadModel(),
      logger: new RecordingLogger(),
    }).execute({ teacherId: 'nope' });
    expect(data).toBeNull();
  });
});
