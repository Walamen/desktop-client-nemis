import { presentConnectivity, presentSyncStatus } from '../presenters/present-status';
import type { StatusPresentation, SyncStatus } from '../presenters/status-presentation';
import type { ConnectivityState } from '../stores/connectivity-store';

export function selectIsOffline(state: ConnectivityState): boolean {
  return !state.isOnline;
}
export function selectSyncStatus(state: ConnectivityState): SyncStatus {
  return state.syncStatus;
}
export function selectSyncPresentation(state: ConnectivityState): StatusPresentation {
  return presentSyncStatus(state.syncStatus, state.lastSyncAt);
}
export function selectConnectivityPresentation(state: ConnectivityState): StatusPresentation {
  return presentConnectivity(state.isOnline);
}
