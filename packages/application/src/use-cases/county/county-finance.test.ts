import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryCountyAnalyticsReadModel } from '../../testing/county/in-memory-county-analytics-read-model';
import { InMemoryCountyFinanceReadModel } from '../../testing/county/in-memory-county-finance-read-model';
import {
  GetCountyFeeCollectionsUseCase,
  GetCountyFeeRulesUseCase,
  GetCountyFinanceDashboardUseCase,
  GetCountyFinanceSchoolsUseCase,
} from './get-county-finance';

const logger = () => new RecordingLogger();

describe('GetCountyFinanceDashboardUseCase', () => {
  it('dashboard carries the county from the analytics read model', async () => {
    const readModel = new InMemoryCountyFinanceReadModel();
    readModel.dashboard = { ...readModel.dashboard, totalCollected: 500, academicYearName: '2025/2026' };
    const countyReadModel = new InMemoryCountyAnalyticsReadModel();
    countyReadModel.county = { id: 'county-1', name: 'Grand Bassa' };

    const { data } = await new GetCountyFinanceDashboardUseCase({ readModel, countyReadModel, logger: logger() }).execute({});

    expect(data).toEqual({ ...readModel.dashboard, county: { id: 'county-1', name: 'Grand Bassa' } });
  });
});

describe('GetCountyFinanceSchoolsUseCase', () => {
  it("schools pass the read model's rows through", async () => {
    const readModel = new InMemoryCountyFinanceReadModel();
    readModel.schools = [
      {
        institutionId: 'a', institutionName: 'Alpha', institutionCode: 'A1', districtId: null, districtName: null,
        totalExpected: 10, totalCollected: 5, totalOutstanding: 5, collectionRate: 50,
        studentCount: 2, paidCount: 1, partialCount: 0, unpaidCount: 1, currency: 'LRD',
      },
    ];

    const { data } = await new GetCountyFinanceSchoolsUseCase({ readModel, logger: logger() }).execute({});

    expect(data).toEqual(readModel.schools);
  });
});

describe('GetCountyFeeCollectionsUseCase', () => {
  it('fee collections trim the search and drop a blank one', async () => {
    const readModel = new InMemoryCountyFinanceReadModel();
    const useCase = new GetCountyFeeCollectionsUseCase({ readModel, logger: logger() });

    await useCase.execute({ search: '  mary  ', districtId: 'd-1', page: 3, limit: 50 });
    expect(readModel.lastCollectionsQuery).toEqual({ search: 'mary', districtId: 'd-1', page: 3, limit: 50 });

    await useCase.execute({ search: '   ', page: 1, limit: 50 });
    expect(readModel.lastCollectionsQuery).toEqual({ search: undefined, page: 1, limit: 50 });
  });
});

describe('GetCountyFeeRulesUseCase', () => {
  it('fee rules trim the search the same way', async () => {
    const readModel = new InMemoryCountyFinanceReadModel();
    const useCase = new GetCountyFeeRulesUseCase({ readModel, logger: logger() });

    await useCase.execute({ search: ' Alpha ', ownership: 'PRIVATE', page: 2, limit: 10 });
    expect(readModel.lastRulesQuery).toEqual({ search: 'Alpha', ownership: 'PRIVATE', page: 2, limit: 10 });

    await useCase.execute({ search: '', page: 1, limit: 10 });
    expect(readModel.lastRulesQuery).toEqual({ search: undefined, page: 1, limit: 10 });
  });
});
