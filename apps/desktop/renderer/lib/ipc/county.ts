import type { CountyApplicationService } from '@nemis-desktop/application';
import { countyBridge } from '@/services/nemis-bridge/county';
import { group, query } from './core';

/** ApplicationLayer groups the County (CEO) portal owns. */
export const countyIpc = {
  county: group<CountyApplicationService>('county', {
    getDashboard: () => query(() => countyBridge.getDashboard()),
  }),
};
