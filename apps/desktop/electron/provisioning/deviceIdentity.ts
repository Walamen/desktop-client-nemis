import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import type { DeviceIdentity } from '@nemis-desktop/types';

const IDENTITY_FILE = 'nemis-device-identity.bin';

export function loadDeviceIdentity(userDataDir: string): DeviceIdentity {
  const file = path.join(userDataDir, IDENTITY_FILE);
  let id: string;
  if (fs.existsSync(file)) {
    id = safeStorage.decryptString(fs.readFileSync(file));
  } else {
    id = randomUUID();
    fs.writeFileSync(file, safeStorage.encryptString(id));
  }
  const material = [id, os.hostname(), process.platform, os.release()].join('|');
  return {
    id,
    fingerprint: createHash('sha256').update(material).digest('hex'),
    name: os.hostname(),
    platform: process.platform,
    osVersion: os.release(),
    appVersion: app.getVersion(),
  };
}
