import type { CurrentUserResult } from '@nemis-desktop/types';
import { api } from '../api';

export const identityBridge = {
  getCurrentUser: (): Promise<CurrentUserResult | null> => api().identity.getCurrentUser(),
};
