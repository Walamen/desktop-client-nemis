import { describe, expect, it } from 'vitest';
import type { SchoolRegistrationInput } from '@nemis-desktop/types';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { SequentialIdGenerator } from '../../testing/sequential-id-generator';
import { InMemorySchoolRegistrationStore } from '../../testing/county/in-memory-school-registration-store';
import { RegisterSchoolsUseCase } from './register-schools';
import { ResubmitSchoolRegistrationUseCase } from './resubmit-school-registration';
import { DiscardSchoolRegistrationUseCase } from './discard-school-registration';
import { GetSchoolRegistrationsUseCase } from './get-school-registrations';
import { GetSchoolRegistrationContextUseCase } from './get-school-registration-context';
import { formSchoolCode, randomSchoolCode } from './school-registration-codes';

const NOW = '2026-10-17T09:00:00.000Z';

const input = (overrides: Partial<SchoolRegistrationInput> = {}): SchoolRegistrationInput => ({
  name: 'Alpha School',
  type: 'SCHOOL',
  levels: ['PRIMARY'],
  ownership: 'GOVERNMENT',
  districtId: 'd-1',
  isActive: true,
  admins: [{ email: 'ada@school.lr', firstName: 'Ada', lastName: 'Doe' }],
  ...overrides,
});

function setup(opts: { random?: () => number; userId?: string } = {}) {
  const store = new InMemorySchoolRegistrationStore();
  store.county = { id: 'c-1', name: 'Grand Bassa', code: 'GB' };
  store.districts = [{ id: 'd-1', name: 'Buchanan' }];
  const base = {
    store,
    currentUserId: opts.userId ?? 'u-1',
    clock: new FixedClock(NOW),
    logger: new RecordingLogger(),
  };
  return {
    store,
    register: new RegisterSchoolsUseCase({ ...base, ids: new SequentialIdGenerator('r'), random: opts.random }),
    resubmit: new ResubmitSchoolRegistrationUseCase({ ...base, random: opts.random }),
    discard: new DiscardSchoolRegistrationUseCase(base),
    list: new GetSchoolRegistrationsUseCase(base),
    context: new GetSchoolRegistrationContextUseCase(base),
  };
}

describe('school registration codes', () => {
  it('form code: county code plus the last 4 EMIS characters, else the last 6 clock digits', () => {
    expect(formSchoolCode('GB', 'LR-0042', NOW)).toBe('GB-0042');
    expect(formSchoolCode(null, '', NOW)).toBe(`XX-${String(Date.parse(NOW)).slice(-6)}`);
  });
  it('random code: 5 upper-case base-36 characters', () => {
    expect(randomSchoolCode('GB', () => 0.5)).toBe(`GB-${(0.5).toString(36).slice(2, 7).toUpperCase()}`);
  });
});

describe('RegisterSchoolsUseCase', () => {
  it('form: mints id and the web code from the EMIS code', async () => {
    const { register, store } = setup();
    const { data } = await register.execute({ source: 'form', schools: [input({ emisCode: 'LR-0042' })] });
    expect(data).toEqual({ status: 'saved', ids: ['r-1'] });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      id: 'r-1',
      countyId: 'c-1',
      createdBy: 'u-1',
      source: 'form',
      syncState: 'pending',
      payload: { code: 'GB-0042', countyId: 'c-1', name: 'Alpha School' },
    });
  });

  it('form: reports a code clash with the existing school name and saves nothing', async () => {
    const { register, store } = setup();
    store.institutionCodes.set('GB-0042', 'Old School');
    const { data } = await register.execute({ source: 'form', schools: [input({ emisCode: 'LR-0042' })] });
    expect(data).toEqual({ status: 'code-clash', clashes: [{ index: 0, code: 'GB-0042', existingName: 'Old School' }] });
    expect(store.rows).toEqual([]);
  });

  it('bulk: random codes; a clash is re-drawn silently', async () => {
    const draws = [0.25, 0.75];
    const { register, store } = setup({ random: () => draws.shift() ?? 0.9 });
    store.institutionCodes.set(randomSchoolCode('GB', () => 0.25), 'Taken');
    const { data } = await register.execute({ source: 'bulk', schools: [input()] });
    expect(data).toEqual({ status: 'saved', ids: ['r-1'] });
    expect(store.rows[0]!.payload.code).toBe(randomSchoolCode('GB', () => 0.75));
  });

  it('returns no-county when no county row has synced', async () => {
    const { register, store } = setup();
    store.county = null;
    const { data } = await register.execute({ source: 'form', schools: [input()] });
    expect(data).toEqual({ status: 'no-county' });
    expect(store.rows).toEqual([]);
  });
});

describe('ResubmitSchoolRegistrationUseCase / DiscardSchoolRegistrationUseCase', () => {
  it('resubmit: rejected row goes back to pending with a new random code, same id', async () => {
    const { register, resubmit, store } = setup({ random: () => 0.5 });
    await register.execute({ source: 'form', schools: [input({ emisCode: 'LR-0042' })] });
    store.rows[0]!.syncState = 'rejected';
    store.rows[0]!.syncError = 'Email taken';
    const { data } = await resubmit.execute({ id: 'r-1', school: input({ name: 'Alpha Fixed', emisCode: 'LR-0042' }) });
    expect(data).toEqual({ status: 'saved', ids: ['r-1'] });
    expect(store.rows[0]).toMatchObject({
      id: 'r-1',
      syncState: 'pending',
      syncError: null,
      payload: { name: 'Alpha Fixed', code: randomSchoolCode('GB', () => 0.5) },
    });
  });

  it("resubmit/discard: not-found for a pending, synced or other user's row", async () => {
    const { register, resubmit, discard, store } = setup();
    await register.execute({ source: 'form', schools: [input()] });
    expect((await resubmit.execute({ id: 'r-1', school: input() })).data).toEqual({ status: 'not-found' });
    expect((await discard.execute({ id: 'r-1' })).data).toEqual({ discarded: false });
    store.rows[0]!.syncState = 'synced';
    expect((await discard.execute({ id: 'r-1' })).data).toEqual({ discarded: false });
    store.rows[0]!.syncState = 'rejected';
    store.rows[0]!.createdBy = 'u-2';
    expect((await discard.execute({ id: 'r-1' })).data).toEqual({ discarded: false });
    store.rows[0]!.createdBy = 'u-1';
    expect((await discard.execute({ id: 'r-1' })).data).toEqual({ discarded: true });
    expect(store.rows).toEqual([]);
  });
});

describe('GetSchoolRegistrationsUseCase / GetSchoolRegistrationContextUseCase', () => {
  it("getSchoolRegistrations returns only the current user's rows", async () => {
    const { register, list, store } = setup();
    await register.execute({ source: 'bulk', schools: [input({ name: 'Mine' })] });
    store.rows.push({ ...store.rows[0]!, id: 'other', createdBy: 'u-2' });
    expect((await list.execute({ ids: [] })).data.map((r) => r.id)).toEqual(['r-1']);
    expect((await list.execute({ ids: ['other'] })).data).toEqual([]);
  });

  it('returns the county and active districts', async () => {
    const { context } = setup();
    expect((await context.execute({})).data).toEqual({
      county: { id: 'c-1', name: 'Grand Bassa', code: 'GB' },
      districts: [{ id: 'd-1', name: 'Buchanan' }],
    });
  });
});
