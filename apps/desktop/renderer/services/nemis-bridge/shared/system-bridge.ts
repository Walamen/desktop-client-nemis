import { api } from '../api';

/** App version — was services/system.ts, folded in here so window.nemis is
 * only ever touched from nemis-bridge/. */
export const systemBridge = {
  getAppVersion: (): Promise<string> => api().system.getVersion(),
};
