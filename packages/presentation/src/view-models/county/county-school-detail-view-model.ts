import type { CountyApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { toSchoolDetailView } from '../../mappers/county/county-schools-view-mapper';
import { GetCountySchoolDetailUiQuery } from '../../queries/county/get-county-school-detail-ui-query';
import type { SchoolDetailView } from './county-schools-views';

export interface CountySchoolDetailState {
  readonly detail: AsyncState<SchoolDetailView>;
  /** The school the latest load was for — `detail` may still describe an
   * earlier one, since this view model outlives the page. */
  readonly requestedId: string | null;
}

export interface CountySchoolDetailViewModelDeps {
  readonly county: CountyApplicationService;
}

/** County School detail page. An unknown or other-county id loads as `empty`. */
export class CountySchoolDetailViewModel {
  readonly store = createStore<CountySchoolDetailState>(() => ({ detail: idleState(), requestedId: null }));

  private readonly query: GetCountySchoolDetailUiQuery;

  constructor(deps: CountySchoolDetailViewModelDeps) {
    this.query = new GetCountySchoolDetailUiQuery(deps.county);
  }

  async load(schoolId: string): Promise<void> {
    this.store.setState({ requestedId: schoolId });
    await trackQuery({
      access: {
        get: () => this.store.getState().detail,
        set: (detail) => this.store.setState({ detail }),
      },
      fetch: () => this.query.execute(schoolId),
      map: toSchoolDetailView,
    });
  }
}
