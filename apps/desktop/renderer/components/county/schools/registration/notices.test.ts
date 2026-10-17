import { describe, expect, it } from 'vitest';
import type { SchoolRegistration, SchoolRegistrationSyncState } from '@nemis-desktop/types';
import { acknowledgeRegistrations, acknowledgedRegistrations, addedMessage, refusedMessage, registrationNotices } from './notices';

const reg = (id: string, syncState: SchoolRegistrationSyncState) => ({ id, syncState }) as SchoolRegistration;

describe('registration notices', () => {
  it('counts pending→synced and pending→rejected moves only', () => {
    const prev = new Map<string, SchoolRegistrationSyncState>([
      ['a', 'pending'],
      ['b', 'pending'],
      ['c', 'synced'],
      ['d', 'pending'],
    ]);
    const next = [reg('a', 'synced'), reg('b', 'rejected'), reg('c', 'synced'), reg('d', 'pending'), reg('e', 'synced')];
    expect(registrationNotices(prev, next, new Set())).toEqual({ added: 1, refused: 1 });
  });

  it('ignores acknowledged ids (the page already told the admin)', () => {
    const prev = new Map<string, SchoolRegistrationSyncState>([['a', 'pending']]);
    expect(registrationNotices(prev, [reg('a', 'synced')], new Set(['a']))).toEqual({ added: 0, refused: 0 });
  });

  it('acknowledged ids accumulate', () => {
    acknowledgeRegistrations(['x']);
    acknowledgeRegistrations(['y']);
    expect([...acknowledgedRegistrations()]).toEqual(expect.arrayContaining(['x', 'y']));
  });

  it('messages use the spec copy', () => {
    expect(addedMessage(1)).toBe('1 school added: principal logins are ready.');
    expect(addedMessage(3)).toBe('3 schools added: principal logins are ready.');
    expect(refusedMessage(1)).toBe("1 school couldn't be added");
    expect(refusedMessage(2)).toBe("2 schools couldn't be added");
  });
});
