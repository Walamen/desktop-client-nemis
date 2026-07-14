import path from 'node:path';
import { BrowserWindow } from 'electron';
import type { AppConfig } from '@app/config/env';

export const RENDERER_ORIGIN = 'app://renderer/';

export function createMainWindow(config: AppConfig): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#020833',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  if (config.isDev) {
    void window.loadURL(config.rendererDevUrl);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    void window.loadURL(RENDERER_ORIGIN);
  }

  return window;
}
