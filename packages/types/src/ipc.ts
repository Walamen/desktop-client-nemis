/**
 * Single source of truth for every IPC endpoint's request/response types.
 * Add an endpoint by adding an entry here first — the main-process
 * registrar and the preload bridge are both keyed off this map.
 * Channel naming convention: `domain:action`.
 */
export interface IpcContract {
  'system:get-version': { args: []; result: string };
}

export type IpcChannel = keyof IpcContract;

export const IpcChannels = {
  SYSTEM_GET_VERSION: 'system:get-version',
} as const satisfies Record<string, IpcChannel>;

export interface IpcErrorPayload {
  code: string;
  message: string;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcErrorPayload };
