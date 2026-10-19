import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerCountyUserCommandHandlers, registerCountyUserHandlers, type CountyUserGateway } from './users';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

const LINK = 'https://portal.example/activate?token=t';
const user = {
  firstName: 'Ada', lastName: 'Doe', email: 'ada@x.lr', phoneNumber: '+231770000000', role: 'INSTITUTION_ADMIN',
  institutionId: 'i-1',
};
const row = { firstName: 'Ben', lastName: 'Roe', email: 'ben@x.lr', phoneNumber: '231770000001', role: 'DEO', districtId: 'd-1' };

function setup(opts: { fails?: boolean } = {}) {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  const county = {
    listUsers: vi.fn(async () => ({ data: { total: 0 } })),
    getUserOptions: vi.fn(async () => ({ data: { county: null, districts: [], schools: [] } })),
  };
  const fail = () => {
    if (opts.fails) throw new Error('You can only manage users in your county.');
  };
  const gateway = {
    setUserActive: vi.fn(async () => (fail(), null)),
    assignCountyUser: vi.fn(async () => (fail(), null)),
    getActivationLink: vi.fn(async () => (fail(), { activationUrl: LINK })),
    createCountyUser: vi.fn(async () => (fail(), { userId: 'new-1', activationUrl: LINK })),
    bulkCreateCountyUsers: vi.fn(async () => (fail(), { succeeded: [], failed: [] })),
  } satisfies CountyUserGateway;
  const refresh = vi.fn(async () => true);
  const countyId = vi.fn(() => 'county-1');
  registerCountyUserHandlers(handle, { county } as unknown as ApplicationLayer);
  registerCountyUserCommandHandlers(handle, gateway, refresh, countyId);
  const call = (channel: string, ...args: unknown[]) => {
    const captured = calls.get(channel)!;
    captured.validate(args);
    return captured.handler(...args);
  };
  const validate = (channel: string, ...args: unknown[]) => () => calls.get(channel)!.validate(args);
  return { county, gateway, refresh, countyId, call, validate };
}

describe('county users read channels', () => {
  it('list and options forward to the County application service', async () => {
    const { county, call } = setup();
    const query = { search: 'ada', role: 'DEO', page: 2, limit: 12 };
    expect(await call('county:list-users', query)).toEqual({ total: 0 });
    expect(county.listUsers).toHaveBeenCalledWith(query);
    expect(await call('county:get-user-options')).toEqual({ county: null, districts: [], schools: [] });
  });
});

describe('county users commands', () => {
  it('each command runs the gateway, then refresh, and returns { data, refreshed }', async () => {
    const { gateway, refresh, call } = setup();
    expect(await call('county:set-user-active', { userId: 'u-1', isActive: false })).toEqual({ data: null, refreshed: true });
    expect(gateway.setUserActive).toHaveBeenCalledWith({ userId: 'u-1', isActive: false });
    expect(await call('county:assign-user', { userId: 'u-1', role: 'DEO', districtId: 'd-1' })).toEqual({ data: null, refreshed: true });
    expect(gateway.assignCountyUser).toHaveBeenCalledWith({ userId: 'u-1', role: 'DEO', districtId: 'd-1' });
    expect(await call('county:get-activation-link', 'u-1')).toEqual({ data: { activationUrl: LINK }, refreshed: true });
    expect(gateway.getActivationLink).toHaveBeenCalledWith('u-1');
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(gateway.setUserActive.mock.invocationCallOrder[0]!).toBeLessThan(refresh.mock.invocationCallOrder[0]!);
  });

  it('create and bulk create send the county from the injected function', async () => {
    const { gateway, countyId, call } = setup();
    expect(await call('county:create-user', user)).toEqual({ data: { userId: 'new-1', activationUrl: LINK }, refreshed: true });
    expect(gateway.createCountyUser).toHaveBeenCalledWith({ ...user, countyId: 'county-1' });
    expect(await call('county:bulk-create-users', [row])).toEqual({ data: { succeeded: [], failed: [] }, refreshed: true });
    expect(gateway.bulkCreateCountyUsers).toHaveBeenCalledWith([row], 'county-1');
    expect(countyId).toHaveBeenCalledTimes(2);
  });

  it('a gateway failure propagates without a refresh', async () => {
    const { refresh, call } = setup({ fails: true });
    for (const [channel, arg] of [
      ['county:set-user-active', { userId: 'u-1', isActive: true }],
      ['county:assign-user', { userId: 'u-1', role: 'DEO', districtId: 'd-1' }],
      ['county:get-activation-link', 'u-1'],
      ['county:create-user', user],
      ['county:bulk-create-users', [row]],
    ] as const) {
      await expect(call(channel, arg)).rejects.toThrow('You can only manage users in your county.');
    }
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('county users validators', () => {
  it('list query: limits, role set and unknown keys', () => {
    const { validate } = setup();
    expect(validate('county:list-users', { page: 1, limit: 12 })).not.toThrow();
    expect(validate('county:list-users', { page: 1, limit: 50, role: 'INSTITUTION_ADMIN', search: 'ada' })).not.toThrow();
    expect(validate('county:list-users', { page: 1, limit: 51 })).toThrow(IPCError);
    expect(validate('county:list-users', { page: 1, limit: 0 })).toThrow(IPCError);
    expect(validate('county:list-users', { page: 0, limit: 12 })).toThrow(IPCError);
    expect(validate('county:list-users', { page: 1_000_001, limit: 12 })).toThrow(IPCError);
    expect(validate('county:list-users', { page: 1, limit: 12, role: 'DATA_OFFICER' })).toThrow(IPCError);
    expect(validate('county:list-users', { page: 1, limit: 12, role: 'SUPER_ADMIN' })).toThrow(IPCError);
    expect(validate('county:list-users', { page: 1, limit: 12, extra: 1 })).toThrow(IPCError);
    expect(validate('county:list-users', { page: 1, limit: 12, search: 7 })).toThrow(IPCError);
    expect(validate('county:get-user-options')).not.toThrow();
    expect(validate('county:get-user-options', 'x')).toThrow(IPCError);
  });

  it('set active: id and boolean', () => {
    const { validate } = setup();
    expect(validate('county:set-user-active', { userId: 'u-1', isActive: true })).not.toThrow();
    expect(validate('county:set-user-active', { userId: 'u-1', isActive: 'yes' })).toThrow(IPCError);
    expect(validate('county:set-user-active', { userId: '', isActive: true })).toThrow(IPCError);
    expect(validate('county:set-user-active', { userId: 'x'.repeat(129), isActive: true })).toThrow(IPCError);
    expect(validate('county:set-user-active', { userId: 'u-1', isActive: true, role: 'DEO' })).toThrow(IPCError);
  });

  it('assign: exactly one target and an assignable role', () => {
    const { validate } = setup();
    expect(validate('county:assign-user', { userId: 'u-1', role: 'DATA_OFFICER', institutionId: 'i-1' })).not.toThrow();
    expect(validate('county:assign-user', { userId: 'u-1', role: 'DEO', districtId: 'd-1' })).not.toThrow();
    expect(validate('county:assign-user', { userId: 'u-1', role: 'DEO', districtId: 'd-1', institutionId: 'i-1' })).toThrow(IPCError);
    expect(validate('county:assign-user', { userId: 'u-1', role: 'DEO' })).toThrow(IPCError);
    expect(validate('county:assign-user', { userId: 'u-1', role: 'SUPER_ADMIN', districtId: 'd-1' })).toThrow(IPCError);
    expect(validate('county:assign-user', { userId: 'u-1', role: 'COUNTY_ADMIN', districtId: 'd-1' })).toThrow(IPCError);
    expect(validate('county:assign-user', { userId: 'u-1', role: 'DEO', districtId: 7 })).toThrow(IPCError);
  });

  it('activation link takes one id', () => {
    const { validate } = setup();
    expect(validate('county:get-activation-link', 'u-1')).not.toThrow();
    expect(validate('county:get-activation-link', 7)).toThrow(IPCError);
    expect(validate('county:get-activation-link')).toThrow(IPCError);
  });

  it('create: names, email, phone and role limits', () => {
    const { validate } = setup();
    const v = (patch: Record<string, unknown>) => validate('county:create-user', { ...user, ...patch });
    expect(v({})).not.toThrow();
    expect(v({ role: 'DEO', institutionId: undefined })).not.toThrow();
    expect(v({ firstName: 'x'.repeat(100) })).not.toThrow();
    expect(v({ firstName: 'x'.repeat(101) })).toThrow(IPCError);
    expect(v({ lastName: '' })).toThrow(IPCError);
    expect(v({ email: `${'a'.repeat(250)}@x.lr` })).not.toThrow();
    expect(v({ email: `${'a'.repeat(251)}@x.lr` })).toThrow(IPCError);
    expect(v({ email: 'not-an-email' })).toThrow(IPCError);
    expect(v({ phoneNumber: '0770000000' })).toThrow(IPCError);
    expect(v({ phoneNumber: '+2317700000001234' })).toThrow(IPCError);
    expect(v({ role: 'SUPER_ADMIN' })).toThrow(IPCError);
    expect(v({ role: 'DATA_OFFICER' })).toThrow(IPCError);
    expect(v({ institutionId: 'x'.repeat(129) })).toThrow(IPCError);
    expect(v({ countyId: 'c-2' })).toThrow(IPCError);
  });

  it('bulk: 1..500 rows, each row checked', () => {
    const { validate } = setup();
    expect(validate('county:bulk-create-users', [row])).not.toThrow();
    expect(validate('county:bulk-create-users', Array.from({ length: 500 }, () => row))).not.toThrow();
    expect(validate('county:bulk-create-users', [])).toThrow(IPCError);
    expect(validate('county:bulk-create-users', Array.from({ length: 501 }, () => row))).toThrow(IPCError);
    expect(validate('county:bulk-create-users', [{ ...row, role: 'SUPER_ADMIN' }])).toThrow(IPCError);
    expect(validate('county:bulk-create-users', [{ ...row, phoneNumber: 'abc' }])).toThrow(IPCError);
    expect(validate('county:bulk-create-users', [{ ...row, countyId: 'c-2' }])).toThrow(IPCError);
    expect(validate('county:bulk-create-users', [row, 'nope'])).toThrow(IPCError);
    expect(validate('county:bulk-create-users', { rows: [row] })).toThrow(IPCError);
  });
});
