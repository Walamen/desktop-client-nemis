import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { createTestApplication } from './create-test-application';

describe('createTestApplication', () => {
  it('wires a working application layer over in-memory fakes', async () => {
    const { app, ports } = createTestApplication();
    const created = await app.students.create({
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
    });
    expect(created.data.id).toBe('id-1'); // SequentialIdGenerator
    expect(created.data.fullName).toBe('Ada Lovelace');
    expect(ports.students.store.size).toBe(1);
    const listed = await app.students.list({ limit: 10, offset: 0 });
    expect(listed.data.total).toBe(1);
  });
});
