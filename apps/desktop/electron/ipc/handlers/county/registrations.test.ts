import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerCountyRegistrationHandlers } from './registrations';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

const ID = '6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b';
const school = {
  name: 'Alpha School', type: 'SCHOOL', levels: ['PRIMARY'], ownership: 'GOVERNMENT', districtId: 'd-1',
  isActive: true, admins: [{ email: 'ada@school.lr', firstName: 'Ada', lastName: 'Doe' }],
};

function setup() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  const county = {
    getRegistrationContext: vi.fn(async () => ({ data: { county: null, districts: [] } })),
    registerSchools: vi.fn(async () => ({ data: { status: 'saved', ids: [ID] } })),
    resubmitSchoolRegistration: vi.fn(async () => ({ data: { status: 'not-found' } })),
    discardSchoolRegistration: vi.fn(async () => ({ data: { discarded: true } })),
    getSchoolRegistrations: vi.fn(async () => ({ data: [{ id: ID, syncState: 'synced' }] })),
  };
  const refresh = vi.fn<(timeoutMs: number) => Promise<boolean>>(async () => true);
  registerCountyRegistrationHandlers(handle, { county } as unknown as ApplicationLayer, refresh);
  const call = (channel: string, ...args: unknown[]) => {
    const captured = calls.get(channel)!;
    captured.validate(args);
    return captured.handler(...args);
  };
  return { calls, county, refresh, call };
}

describe('county school registration channels', () => {
  it('forward to the County application service and return its data', async () => {
    const { county, call } = setup();
    expect(await call('county:get-registration-context')).toEqual({ county: null, districts: [] });
    expect(await call('county:register-schools', { source: 'form', schools: [school] })).toEqual({ status: 'saved', ids: [ID] });
    expect(county.registerSchools).toHaveBeenCalledWith({ source: 'form', schools: [school] });
    expect(await call('county:resubmit-school-registration', { id: ID, school })).toEqual({ status: 'not-found' });
    expect(await call('county:discard-school-registration', ID)).toEqual({ discarded: true });
    expect(county.discardSchoolRegistration).toHaveBeenCalledWith(ID);
    expect(await call('county:get-school-registrations', [ID])).toEqual([{ id: ID, syncState: 'synced' }]);
  });

  it('settle runs a bounded sync first, then reads the states', async () => {
    const { county, refresh, call } = setup();
    expect(await call('county:settle-school-registrations', [ID], 60_000)).toEqual([{ id: ID, syncState: 'synced' }]);
    expect(refresh).toHaveBeenLastCalledWith(30_000);
    await call('county:settle-school-registrations', [ID], 0);
    expect(refresh).toHaveBeenLastCalledWith(1_000);
    expect(county.getSchoolRegistrations).toHaveBeenCalledWith([ID]);
    expect(refresh.mock.invocationCallOrder[0]!).toBeLessThan(county.getSchoolRegistrations.mock.invocationCallOrder[0]!);
  });

  it('validators refuse malformed requests', () => {
    const { calls } = setup();
    const validate = (channel: string, ...args: unknown[]) => () => calls.get(channel)!.validate(args);
    expect(validate('county:register-schools', { source: 'x', schools: [school] })).toThrow(IPCError);
    expect(validate('county:register-schools', { source: 'bulk', schools: Array.from({ length: 501 }, () => school) })).toThrow(IPCError);
    expect(validate('county:register-schools', { source: 'bulk', schools: [{ ...school, name: 7 }] })).toThrow(IPCError);
    expect(validate('county:register-schools', { source: 'bulk', schools: [{ ...school, districtId: null }] })).toThrow(IPCError);
    expect(validate('county:register-schools', { source: 'bulk', schools: 'nope' })).toThrow(IPCError);
    expect(validate('county:resubmit-school-registration', { id: 'not-a-uuid', school })).toThrow(IPCError);
    expect(validate('county:discard-school-registration', 'not-a-uuid')).toThrow(IPCError);
    expect(validate('county:get-school-registrations', 'nope')).toThrow(IPCError);
    expect(validate('county:get-school-registrations', Array.from({ length: 501 }, () => ID))).toThrow(IPCError);
    expect(validate('county:settle-school-registrations', [ID], Number.NaN)).toThrow(IPCError);
    expect(validate('county:get-registration-context', 'x')).toThrow(IPCError);
    expect(validate('county:register-schools', { source: 'bulk', schools: [school] })).not.toThrow();
  });
});
