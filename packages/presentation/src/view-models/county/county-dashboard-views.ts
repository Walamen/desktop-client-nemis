import type { CountyChartData, CountyDashboardStats, CountyDistrict } from '@nemis-desktop/types';

/** What the County dashboard renders — shaped to the props of the chart
 * components ported from portal-web (DistrictScorecardCard reads
 * `district._count.institutions`). */
export interface CountyDashboardView {
  readonly county: { readonly id: string; readonly name: string } | null;
  readonly districts: CountyDistrict[];
  readonly stats: CountyDashboardStats;
  readonly chartData: CountyChartData;
  readonly byLevel: Record<string, number>;
}
