
import path from 'node:path';
import {  BrowserWindow, screen } from 'electron';
import type { AppConfig } from '@app/config/env';

export const RENDERER_ORIGIN = 'app://renderer/';

export function createMainWindow(config: AppConfig): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;



  // Keep minimum dimensions within the available screen size.
  const minWidth = Math.min(1280, screenWidth);
  const minHeight = Math.min(700, screenHeight);

  const window = new BrowserWindow({
    width: screenWidth,
    height: screenHeight,
    minWidth,
    minHeight,
    center: true,
    show: false,
    backgroundColor: '#020833',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  if (config.isDev) {
    void window.loadURL(config.rendererDevUrl);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    void window.loadURL(RENDERER_ORIGIN);
  }

  return window;
}
