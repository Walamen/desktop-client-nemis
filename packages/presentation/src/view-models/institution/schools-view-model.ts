import type { InstitutionApplicationService, InstitutionSummaryOutput } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { ListInstitutionsUiQuery } from '../../queries/institution/list-institutions-ui-query';

export interface SchoolsState {
  readonly institutions: AsyncState<InstitutionSummaryOutput[]>;
}

export interface SchoolsViewModelDeps {
  readonly institution: InstitutionApplicationService;
}

export class SchoolsViewModel {
  readonly store = createStore<SchoolsState>(() => ({ institutions: idleState() }));

  private readonly query: ListInstitutionsUiQuery;

  constructor(deps: SchoolsViewModelDeps) {
    this.query = new ListInstitutionsUiQuery(deps.institution);
  }

  async loadInstitutions(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().institutions,
        set: (institutions) => this.store.setState({ institutions }),
      },
      fetch: () => this.query.execute(),
      map: (rows) => rows,
      isEmpty: (rows) => rows.length === 0,
    });
  }
}
