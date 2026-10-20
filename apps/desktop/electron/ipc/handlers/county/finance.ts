import { IpcChannels, type CountyFeeCollectionsQuery, type CountyFeeRulesQuery } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertCountyFeeCollectionsQueryArgs,
  assertCountyFeeRulesQueryArgs,
  assertNoArgs,
} from '@app/security/validateIpc';

/** County Finance overview and Fee Rules, read from this device. */
export function registerCountyFinanceHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.COUNTY_FINANCE_DASHBOARD, assertNoArgs, async () => (await app.county.getFinanceDashboard()).data);
  handle(IpcChannels.COUNTY_FINANCE_SCHOOLS, assertNoArgs, async () => (await app.county.listFinanceSchools()).data);
  handle(IpcChannels.COUNTY_FINANCE_PAYMENTS, assertCountyFeeCollectionsQueryArgs, async (query: CountyFeeCollectionsQuery) =>
    (await app.county.listFeeCollections(query)).data,
  );
  handle(IpcChannels.COUNTY_FINANCE_FEE_RULES, assertCountyFeeRulesQueryArgs, async (query: CountyFeeRulesQuery) =>
    (await app.county.listFeeRules(query)).data,
  );
}
