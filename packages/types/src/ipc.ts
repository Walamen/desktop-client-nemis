/**
 * Single source of truth for every IPC endpoint's request/response types.
 * Add an endpoint by adding an entry here first — the main-process
 * registrar and the preload bridge are both keyed off this map.
 * Channel naming convention: `domain:action`.
 */
export interface IpcContract {
  'system:get-version': { args: []; result: string };
  'settings:get': { args: [key: string]; result: unknown };
}

export type IpcChannel = keyof IpcContract;

export const IpcChannels = {
  SYSTEM_GET_VERSION: 'system:get-version',
  SETTINGS_GET: 'settings:get',
} as const satisfies Record<string, IpcChannel>;

// Compile-time exhaustiveness: adding a channel to IpcContract without
// listing it in IpcChannels makes this constant a type error.
type RegisteredChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
export const IPC_CHANNELS_EXHAUSTIVE: Exclude<IpcChannel, RegisteredChannel> extends never
  ? true
  : never = true;

export interface IpcErrorPayload {
  code: string;
  message: string;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcErrorPayload };
