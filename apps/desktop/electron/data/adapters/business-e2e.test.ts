import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { DatabaseManager } from '../../database/DatabaseManager';
import { createDataLayer, type DataLayer } from '../factories/createDataLayer';
import { createApplicationComposition } from './createApplicationComposition';

const TEST_DEVICE = { deviceName: 'business-e2e', platform: 'win32', osVersion: '10.0', appVersion: '1.0.0' };
const silent = { info: () => {}, warn: () => {}, error: () => {} };

describe('business application layer end-to-end against real SQLite', () => {
  let directory: string;
  let manager: DatabaseManager;
  let dataLayer: DataLayer;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-business-e2e-'));
    manager = new DatabaseManager({ userDataDir: directory, device: TEST_DEVICE });
    manager.initialize();
    dataLayer = createDataLayer(manager, silent);
  });

  afterEach(() => {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('dashboard overview is all zeros on a fresh install', async () => {
    const app = createApplicationComposition(dataLayer, silent);
    const res = await app.reporting.getDashboardOverview();
    expect(res.data).toEqual({ totalStudents: 0, totalClasses: 0, attendanceToday: { present: 0, total: 0 } });
  });

  it('current user is the seeded Local Admin; school and academic year are null', async () => {
    const app = createApplicationComposition(dataLayer, silent);
    expect((await app.identity.getCurrentUser()).data?.fullName).toBe('Local Admin');
    expect((await app.institution.getCurrentSchool()).data).toBeNull();
    expect((await app.academics.getCurrentAcademicYear()).data).toBeNull();
  });

  it('device info reflects the seeded device', async () => {
    const app = createApplicationComposition(dataLayer, silent);
    expect((await app.infra.getDeviceInfo()).data?.deviceName).toBe('business-e2e');
  });

  it('creating a student through the use case increments the overview count', async () => {
    const app = createApplicationComposition(dataLayer, silent);
    await app.students.create({
      institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe',
      admissionNumber: 'ADM-1', dateOfBirth: '2015-01-01', gender: Gender.FEMALE,
    });
    expect((await app.reporting.getDashboardOverview()).data.totalStudents).toBe(1);
  });
});
