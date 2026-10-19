import type { CountyUserOptions, CountyUsersQuery, CountyUsersResult } from '@nemis-desktop/types';
import type { ICountyUsersReadModel } from '../../interfaces/county/county-users-read-model';

export interface InMemoryCountyUsersSeed {
  list: Omit<CountyUsersResult, 'county'>;
  options: Omit<CountyUserOptions, 'county'>;
}

/** Canned page and options; records the last query. */
export class InMemoryCountyUsersReadModel implements ICountyUsersReadModel {
  list: Omit<CountyUsersResult, 'county'>;
  options: Omit<CountyUserOptions, 'county'>;
  lastQuery: CountyUsersQuery | null = null;

  constructor(
    seed: InMemoryCountyUsersSeed = {
      list: {
        stats: { totalUsers: 0, activeUsers: 0, pendingActivation: 0, schoolAdmins: 0 },
        data: [],
        total: 0,
      },
      options: { districts: [], schools: [] },
    },
  ) {
    this.list = seed.list;
    this.options = seed.options;
  }

  listUsers(query: CountyUsersQuery): Omit<CountyUsersResult, 'county'> {
    this.lastQuery = query;
    return this.list;
  }

  listOptions(): Omit<CountyUserOptions, 'county'> {
    return this.options;
  }
}
