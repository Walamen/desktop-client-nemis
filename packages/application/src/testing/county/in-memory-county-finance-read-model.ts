import type {
  CountyFeeCollectionsQuery,
  CountyFeeCollectionsResult,
  CountyFeeRulesQuery,
  CountyFeeRulesResult,
  CountyFinanceDashboard,
  CountySchoolFinanceRow,
} from '@nemis-desktop/types';
import type { ICountyFinanceReadModel } from '../../interfaces/county/county-finance-read-model';

/** Settable canned finance data; records the last queries. */
export class InMemoryCountyFinanceReadModel implements ICountyFinanceReadModel {
  dashboard: Omit<CountyFinanceDashboard, 'county'> = {
    academicYearName: null,
    totalExpected: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    collectionRate: 0,
    schoolsReporting: 0,
    totalSchools: 0,
    studentsPaid: 0,
    studentsPartial: 0,
    studentsUnpaid: 0,
    currency: 'LRD',
    districtComparison: [],
  };
  schools: CountySchoolFinanceRow[] = [];
  collections: CountyFeeCollectionsResult = {
    summary: { totalCollected: 0, totalTransactions: 0, schoolsWithPayments: 0 },
    records: [],
    total: 0,
    page: 1,
    limit: 50,
  };
  rules: CountyFeeRulesResult = { schools: [], total: 0, page: 1, limit: 10 };
  /** When set, getDashboard throws it. */
  dashboardError: Error | null = null;
  lastCollectionsQuery: CountyFeeCollectionsQuery | null = null;
  lastRulesQuery: CountyFeeRulesQuery | null = null;

  getDashboard(): Omit<CountyFinanceDashboard, 'county'> {
    if (this.dashboardError) throw this.dashboardError;
    return this.dashboard;
  }

  listSchools(): CountySchoolFinanceRow[] {
    return this.schools;
  }

  listFeeCollections(query: CountyFeeCollectionsQuery): CountyFeeCollectionsResult {
    this.lastCollectionsQuery = query;
    return this.collections;
  }

  listFeeRules(query: CountyFeeRulesQuery): CountyFeeRulesResult {
    this.lastRulesQuery = query;
    return this.rules;
  }
}
