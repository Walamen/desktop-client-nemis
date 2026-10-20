import type {
  CountyFeeCollectionsQuery,
  CountyFeeCollectionsResult,
  CountyFeeRulesQuery,
  CountyFeeRulesResult,
  CountyFinanceDashboard,
  CountySchoolFinanceRow,
} from '@nemis-desktop/types';

/** County (CEO) Finance overview and Fee Rules, read from this device's
 * synced fee ledger (docs/superpowers/specs/2026-10-20-county-finance-design.md).
 * Everything but fee rules covers each school's current academic year. */
export interface ICountyFinanceReadModel {
  /** ceo-finance getCountyDashboard, own county's active schools. */
  getDashboard(): Omit<CountyFinanceDashboard, 'county'>;
  /** getSchoolFinanceSummaries, one row per active school, worst rate first. */
  listSchools(): CountySchoolFinanceRow[];
  /** getCountyFeeCollections: non-reversed current-year payments, newest first. */
  listFeeCollections(query: CountyFeeCollectionsQuery): CountyFeeCollectionsResult;
  /** getAllSchoolFeeRules: every school rule, grouped by school. */
  listFeeRules(query: CountyFeeRulesQuery): CountyFeeRulesResult;
}
