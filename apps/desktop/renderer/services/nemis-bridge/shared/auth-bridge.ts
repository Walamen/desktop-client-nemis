import { api } from '../api';

/** Provisioning + login/logout — used by every portal before a role is even
 * known (app/page.tsx, RouteGuard, Sidebar, Header). */
export const authBridge = {
  getProvisioningStatus: () => api().auth.getStatus(),
  authenticate: (email: string, password: string) => api().auth.login({ email, password }),
  logout: () => api().auth.logout(),
  startProvisioning: () => api().provisioning.start(),
};
