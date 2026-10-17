import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineError, RateLimitedError, RemoteRejectedError, UnauthorizedError } from '@nemis-desktop/shared';
import { migrations } from '@app/database/migrations/registry';
import { SchoolRegistrationSyncService } from './SchoolRegistrationSyncService';

type CreateInstitution = (id: string, payload: unknown) => Promise<{ principal: { email: string; defaultPassword: string } | null }>;

function db(): SqliteDatabase {
  const connection = new Database(':memory:');
  connection.pragma('foreign_keys = OFF');
  for (const migration of migrations) migration.up(connection);
  connection.prepare(`INSERT INTO counties (id,code,name) VALUES ('c-1','GB','Grand Bassa')`).run();
  return connection;
}

function seed(
  connection: SqliteDatabase,
  id: string,
  opts: { createdBy?: string; countyId?: string; createdAt?: string; state?: string } = {},
) {
  const at = opts.createdAt ?? '2026-10-17T09:00:00.000Z';
  connection
    .prepare(
      `INSERT INTO school_registrations (id,countyId,createdBy,source,payload,syncState,createdAt,updatedAt)
       VALUES (?,?,?,'form',?,?,?,?)`,
    )
    .run(
      id,
      opts.countyId ?? 'c-1',
      opts.createdBy ?? 'u-1',
      JSON.stringify({ name: `School ${id}`, code: `GB-${id}` }),
      opts.state ?? 'pending',
      at,
      at,
    );
}

const stateOf = (connection: SqliteDatabase, id: string) =>
  connection
    .prepare(`SELECT syncState, syncError, principalEmail, principalPassword, syncedAt FROM school_registrations WHERE id=?`)
    .get(id) as Record<string, unknown>;

describe('SchoolRegistrationSyncService', () => {
  let connection: SqliteDatabase;
  beforeEach(() => {
    connection = db();
  });

  it('2xx: synced with the principal login, accepted count 1', async () => {
    seed(connection, 'r-1');
    const gateway = {
      createInstitution: vi.fn<CreateInstitution>(async () => ({
        principal: { email: 'ada@school.lr', defaultPassword: 'Nemis@123' },
      })),
    };
    const result = await new SchoolRegistrationSyncService(gateway).pushPending(connection, 'u-1');
    expect(result).toEqual({ accepted: 1, rejected: 0 });
    expect(gateway.createInstitution).toHaveBeenCalledWith('r-1', { name: 'School r-1', code: 'GB-r-1' });
    expect(stateOf(connection, 'r-1')).toMatchObject({
      syncState: 'synced',
      syncError: null,
      principalEmail: 'ada@school.lr',
      principalPassword: 'Nemis@123',
    });
    expect(stateOf(connection, 'r-1').syncedAt).toEqual(expect.any(String));
  });

  it('4xx: rejected with the server message; the next row is still sent', async () => {
    seed(connection, 'a', { createdAt: '2026-10-17T09:00:00.000Z' });
    seed(connection, 'b', { createdAt: '2026-10-17T10:00:00.000Z' });
    const gateway = {
      createInstitution: vi
        .fn()
        .mockRejectedValueOnce(new RemoteRejectedError(409, 'Principal email already in use'))
        .mockResolvedValueOnce({ principal: null }),
    };
    expect(await new SchoolRegistrationSyncService(gateway).pushPending(connection, 'u-1')).toEqual({ accepted: 1, rejected: 1 });
    expect(gateway.createInstitution.mock.calls.map((call) => call[0])).toEqual(['a', 'b']);
    expect(stateOf(connection, 'a')).toMatchObject({ syncState: 'rejected', syncError: 'Principal email already in use' });
    expect(stateOf(connection, 'b')).toMatchObject({ syncState: 'synced', principalEmail: null });
  });

  it('a refusal with no message gets the fallback text', async () => {
    seed(connection, 'a');
    const gateway = { createInstitution: vi.fn().mockRejectedValue(new RemoteRejectedError(400, undefined)) };
    await new SchoolRegistrationSyncService(gateway).pushPending(connection, 'u-1');
    expect(stateOf(connection, 'a')).toMatchObject({ syncState: 'rejected', syncError: 'The server refused this school.' });
  });

  it('401, 429, 5xx and unreachable leave the row pending', async () => {
    seed(connection, 'a');
    const failures = [
      new UnauthorizedError(),
      new RateLimitedError('Slow down'),
      Object.assign(new Error('Provisioning request failed with status 500.'), { status: 500 }),
      new OfflineError(),
    ];
    for (const failure of failures) {
      const gateway = { createInstitution: vi.fn().mockRejectedValue(failure) };
      expect(await new SchoolRegistrationSyncService(gateway).pushPending(connection, 'u-1')).toEqual({ accepted: 0, rejected: 0 });
      expect(stateOf(connection, 'a')).toMatchObject({ syncState: 'pending', syncError: null });
    }
  });

  it("never sends another user's or another county's rows", async () => {
    seed(connection, 'mine');
    seed(connection, 'theirs', { createdBy: 'u-2' });
    seed(connection, 'elsewhere', { countyId: 'c-2' });
    seed(connection, 'done', { state: 'synced' });
    const gateway = { createInstitution: vi.fn<CreateInstitution>(async () => ({ principal: null })) };
    await new SchoolRegistrationSyncService(gateway).pushPending(connection, 'u-1');
    expect(gateway.createInstitution.mock.calls.map((call) => call[0])).toEqual(['mine']);
  });

  it('a school resubmitted while its request was in flight stays pending', async () => {
    seed(connection, 'a');
    const gateway = {
      createInstitution: vi.fn(async () => {
        connection
          .prepare(`UPDATE school_registrations SET updatedAt='2026-10-18T00:00:00.000Z' WHERE id='a'`)
          .run();
        throw new RemoteRejectedError(409, 'Code taken');
      }),
    };
    await new SchoolRegistrationSyncService(gateway).pushPending(connection, 'u-1');
    expect(stateOf(connection, 'a')).toMatchObject({ syncState: 'pending' });
  });
});

describe('SchoolRegistrationSyncService — stopping on a transport failure', () => {
  it('stops the batch at the first failure that is not a refusal, so a bad network cannot stall the worker', async () => {
    const connection = db();
    seed(connection, 'a', { createdAt: '2026-10-17T09:00:00.000Z' });
    seed(connection, 'b', { createdAt: '2026-10-17T10:00:00.000Z' });
    const gateway = { createInstitution: vi.fn<CreateInstitution>().mockRejectedValue(new OfflineError()) };
    expect(await new SchoolRegistrationSyncService(gateway).pushPending(connection, 'u-1')).toEqual({ accepted: 0, rejected: 0 });
    expect(gateway.createInstitution).toHaveBeenCalledTimes(1);
    expect(stateOf(connection, 'b')).toMatchObject({ syncState: 'pending' });
  });

  it('reports how many it refused, so the worker can pull and show them', async () => {
    const connection = db();
    seed(connection, 'a');
    const gateway = { createInstitution: vi.fn<CreateInstitution>().mockRejectedValue(new RemoteRejectedError(404, 'District not found')) };
    expect(await new SchoolRegistrationSyncService(gateway).pushPending(connection, 'u-1')).toEqual({ accepted: 0, rejected: 1 });
  });
});
