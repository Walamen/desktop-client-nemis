import { IpcChannels } from '@nemis-desktop/types';
import type { RegistryApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const registryApi: RegistryApi = {
  lookup: (request) => invoke(IpcChannels.REGISTRY_LOOKUP, request),
  claim: (request) => invoke(IpcChannels.REGISTRY_CLAIM, request),
  request: (request) => invoke(IpcChannels.REGISTRY_REQUEST, request),
};
