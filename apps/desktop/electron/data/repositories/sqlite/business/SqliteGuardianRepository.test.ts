import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Guardian } from '@nemis-desktop/domain';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteGuardianRepository } from './SqliteGuardianRepository';

function record(id: string, overrides: Partial<Parameters<typeof Guardian.create>[0]> = {}): Guardian {
  return Guardian.create({
    id,
    firstName: 'Grace',
    lastName: 'Hopper',
    relationship: 'Mother',
    phoneNumber: '0770000000',
    occurredAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  });
}

describe('SqliteGuardianRepository', () => {
  let test: TestContext;
  let repo: SqliteGuardianRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteGuardianRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('save + findById round-trips a guardian including its email', () => {
    repo.save(record('g-1', { email: 'grace@example.com' }));
    const found = repo.findById('g-1');
    expect(found?.email).toBe('grace@example.com');
    expect(found?.name.firstName).toBe('Grace');
  });

  it('save + findById leaves email undefined when not provided', () => {
    repo.save(record('g-2'));
    expect(repo.findById('g-2')?.email).toBeUndefined();
  });

  it('findById returns null for a missing id', () => {
    expect(repo.findById('nope')).toBeNull();
  });
});
