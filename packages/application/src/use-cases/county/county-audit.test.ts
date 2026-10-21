import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryCountyAuditReadModel, InMemoryCountySettingsReadModel } from '../../testing/county/in-memory-county-audit';
import { GetCountyAuditLogsUseCase, GetCountyAuditStatsUseCase, GetCountySettingsUseCase } from './get-county-audit';

const logger = () => new RecordingLogger();

describe('County audit use cases', () => {
  it('stats delegate to the read model', async () => {
    const readModel = new InMemoryCountyAuditReadModel();
    readModel.stats = { total: 3, today: 1, week: 2, actions: [], entityTypes: [] };
    const result = await new GetCountyAuditStatsUseCase({ readModel, logger: logger() }).execute({});
    expect(result.data).toEqual(readModel.stats);
  });

  it('list clamps paging and drops a blank search', async () => {
    const readModel = new InMemoryCountyAuditReadModel();
    await new GetCountyAuditLogsUseCase({ readModel, logger: logger() }).execute({ page: 0, limit: 500, search: '  ' });
    expect(readModel.lastQuery).toEqual({ page: 1, limit: 100, search: undefined, action: undefined, entityType: undefined });
  });

  it('list trims the search and keeps the filters', async () => {
    const readModel = new InMemoryCountyAuditReadModel();
    await new GetCountyAuditLogsUseCase({ readModel, logger: logger() }).execute({
      page: 2, limit: 50, search: ' jam ', action: 'CREATE', entityType: 'Staff',
    });
    expect(readModel.lastQuery).toEqual({ page: 2, limit: 50, search: 'jam', action: 'CREATE', entityType: 'Staff' });
  });
});

describe('County settings use case', () => {
  it('delegates to the read model', async () => {
    const readModel = new InMemoryCountySettingsReadModel();
    const result = await new GetCountySettingsUseCase({ readModel, logger: logger() }).execute({});
    expect(result.data).toEqual({ county: null, districtCount: 0, schoolCount: 0 });
  });
});
