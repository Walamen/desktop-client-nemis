import type { NemisApi } from '@nemis-desktop/types';

declare global {
  interface Window {
    /** Exposed by the Electron preload script; absent in a plain browser. */
    nemis?: NemisApi;
  }
}

export {};
