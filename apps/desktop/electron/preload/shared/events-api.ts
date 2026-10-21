import { ipcRenderer, type IpcRendererEvent } from 'electron';
import { REALTIME_EVENT_CHANNEL, type EventsApi, type RealtimeEvent } from '@nemis-desktop/types';

/** Main → renderer events (live socket, sync). The renderer only listens;
 * nothing it sends travels this way. */
export const eventsApi: EventsApi = {
  subscribe(listener: (event: RealtimeEvent) => void): () => void {
    const handler = (_event: IpcRendererEvent, payload: RealtimeEvent) => listener(payload);
    ipcRenderer.on(REALTIME_EVENT_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(REALTIME_EVENT_CHANNEL, handler);
    };
  },
};
