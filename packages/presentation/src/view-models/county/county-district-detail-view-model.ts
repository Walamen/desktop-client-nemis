import type { CountyApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { toCountyDistrictDetailView } from '../../mappers/county/county-districts-view-mapper';
import { GetCountyDistrictDetailUiQuery } from '../../queries/county/get-county-district-detail-ui-query';
import type { CountyDistrictDetailView } from './county-districts-views';

export interface CountyDistrictDetailState {
  readonly detail: AsyncState<CountyDistrictDetailView>;
}

export interface CountyDistrictDetailViewModelDeps {
  readonly county: CountyApplicationService;
}

/** District Details page. An unknown or other-county id loads as `empty`. */
export class CountyDistrictDetailViewModel {
  readonly store = createStore<CountyDistrictDetailState>(() => ({ detail: idleState() }));

  private readonly query: GetCountyDistrictDetailUiQuery;

  constructor(deps: CountyDistrictDetailViewModelDeps) {
    this.query = new GetCountyDistrictDetailUiQuery(deps.county);
  }

  async load(districtId: string): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().detail,
        set: (detail) => this.store.setState({ detail }),
      },
      fetch: () => this.query.execute(districtId),
      map: toCountyDistrictDetailView,
    });
  }
}
