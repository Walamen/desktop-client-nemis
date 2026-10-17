import { describe, expect, it } from 'vitest';
import type { SchoolRegistration } from '@nemis-desktop/types';
import { settleMany, settleOne } from './settle';

const reg = (id: string, extra: Partial<SchoolRegistration> = {}): SchoolRegistration => ({
  id,
  countyId: 'c-1',
  source: 'form',
  payload: {} as SchoolRegistration['payload'],
  syncState: 'pending',
  syncError: null,
  principalLogin: null,
  createdAt: 'x',
  updatedAt: 'x',
  syncedAt: null,
  ...extra,
});

describe('settle outcomes', () => {
  it('settleOne: accepted with the login, refused with the reason, otherwise waiting', () => {
    const login = { email: 'ada@school.lr', password: 'Nemis@123' };
    expect(settleOne(reg('a', { syncState: 'synced', principalLogin: login }))).toEqual({ kind: 'accepted', login });
    expect(settleOne(reg('a', { syncState: 'rejected', syncError: 'Email taken' }))).toEqual({ kind: 'refused', message: 'Email taken' });
    expect(settleOne(reg('a', { syncState: 'rejected', syncError: null }))).toEqual({
      kind: 'refused',
      message: 'The server refused this school.',
    });
    expect(settleOne(reg('a'))).toEqual({ kind: 'waiting' });
    expect(settleOne(undefined)).toEqual({ kind: 'waiting' });
  });

  it('settleMany splits rows by state', () => {
    const rows = [reg('a', { syncState: 'synced' }), reg('b', { syncState: 'rejected' }), reg('c')];
    expect(settleMany(rows)).toEqual({ created: [rows[0]], failed: [rows[1]], waiting: [rows[2]] });
  });
});
