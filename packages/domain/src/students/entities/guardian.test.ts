import { describe, expect, it } from 'vitest';
import { Guardian } from './guardian';

describe('Guardian', () => {
  it('create() stores an optional email', () => {
    const guardian = Guardian.create({
      id: 'g-1',
      firstName: 'John',
      lastName: 'Doe',
      relationship: 'Father',
      phoneNumber: '0770000000',
      email: 'john@example.com',
      occurredAt: '2026-08-16T00:00:00.000Z',
    });
    expect(guardian.email).toBe('john@example.com');
  });

  it('create() leaves email undefined when not provided', () => {
    const guardian = Guardian.create({
      id: 'g-2',
      firstName: 'Jane',
      lastName: 'Doe',
      relationship: 'Mother',
      phoneNumber: '0770000001',
      occurredAt: '2026-08-16T00:00:00.000Z',
    });
    expect(guardian.email).toBeUndefined();
  });

  it('reconstitute() restores the stored email', () => {
    const guardian = Guardian.reconstitute({
      id: 'g-3',
      firstName: 'John',
      lastName: 'Doe',
      relationship: 'Father',
      phoneNumber: '0770000000',
      email: 'john@example.com',
      version: 2,
      updatedAt: '2026-08-16T00:00:00.000Z',
    });
    expect(guardian.email).toBe('john@example.com');
  });
});
