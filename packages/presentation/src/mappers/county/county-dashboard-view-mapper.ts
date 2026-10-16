import type { CountyDashboardOutput } from '@nemis-desktop/application';
import type { CountyDashboardView } from '../../view-models/county/county-dashboard-views';

export function toCountyDashboardView(dto: CountyDashboardOutput): CountyDashboardView {
  return {
    county: dto.county,
    districts: dto.districts.map(({ id, name, activeSchoolCount }) => ({
      id,
      name,
      _count: { institutions: activeSchoolCount },
    })),
    stats: dto.stats,
    chartData: dto.chartData,
    byLevel: dto.byLevel,
  };
}
