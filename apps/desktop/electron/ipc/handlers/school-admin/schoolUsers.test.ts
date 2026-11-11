import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel, SchoolOfficeUser, SchoolUsersResult } from '@nemis-desktop/types';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerSchoolUserHandlers, type SchoolUserGateway } from './schoolUsers';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@app/services/logger', () => ({ logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

const SERVER_USER: SchoolOfficeUser = {
  id: 'u-1', firstName: 'Ada', lastName: 'Doe', email: 'ada@school.lr', phoneNumber: null, photoUrl: null,
  role: 'INSTITUTION_STAFF', title: 'Registrar', modules: ['STUDENTS'], isActive: false, lastLoginAt: null,
  staffId: null,
};
const DEVICE: SchoolUsersResult = {
  source: 'device',
  users: [{ ...SERVER_USER, id: 'u-device', isActive: true }],
  linkableStaff: [{ id: 'st-1', firstName: 'Ben', lastName: 'Roe', position: 'TEACHER' }],
};
const CREDENTIAL = { email: 'ada@school.lr', defaultPassword: 'Secret-Pw-1' };

function setup(opts: { online?: boolean; fails?: boolean } = {}) {
  warn.mockClear();
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  const institution = { listSchoolUsers: vi.fn(async () => ({ data: DEVICE })) };
  const fail = () => {
    if (opts.fails) throw new Error('Email already registered');
  };
  const gateway = {
    listSchoolUsers: vi.fn(async () => (fail(), [SERVER_USER])),
    createSchoolUser: vi.fn(async () => (fail(), { user: SERVER_USER, credential: CREDENTIAL })),
    updateSchoolUser: vi.fn(async () => (fail(), SERVER_USER)),
    setSchoolUserActive: vi.fn(async () => (fail(), SERVER_USER)),
  } satisfies SchoolUserGateway;
  const refresh = vi.fn(async () => true);
  registerSchoolUserHandlers(handle, { institution } as unknown as ApplicationLayer, {
    gateway,
    isOnline: () => opts.online ?? true,
    refresh,
    institutionId: () => 'sch-1',
  });
  const call = (channel: string, ...args: unknown[]) => {
    const captured = calls.get(channel)!;
    captured.validate(args);
    return captured.handler(...args);
  };
  return { institution, gateway, refresh, call };
}

describe('school users list', () => {
  it('online list comes from the server', async () => {
    const { gateway, institution, call } = setup();
    expect(await call('school-users:list')).toEqual({
      source: 'server',
      users: [SERVER_USER],
      linkableStaff: DEVICE.linkableStaff,
    });
    expect(gateway.listSchoolUsers).toHaveBeenCalledTimes(1);
    expect(institution.listSchoolUsers).toHaveBeenCalledWith({ institutionId: 'sch-1' });
  });

  it('offline list comes from the device without calling the gateway', async () => {
    const { gateway, institution, call } = setup({ online: false });
    expect(await call('school-users:list')).toEqual(DEVICE);
    expect(gateway.listSchoolUsers).not.toHaveBeenCalled();
    expect(institution.listSchoolUsers).toHaveBeenCalledWith({ institutionId: 'sch-1' });
  });

  it('server failure while online falls back to the device', async () => {
    const { gateway, call } = setup({ fails: true });
    expect(await call('school-users:list')).toEqual(DEVICE);
    expect(gateway.listSchoolUsers).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toHaveLength(1);
  });

  it('the list takes no arguments', () => {
    const { call } = setup();
    expect(() => call('school-users:list', 'extra')).toThrow();
  });
});

describe('school users commands', () => {
  it('create calls the gateway then refresh and returns the credential', async () => {
    const { gateway, refresh, call } = setup();
    const request = { firstName: 'Ada', lastName: 'Doe', email: 'ada@school.lr', modules: ['STUDENTS'] };
    expect(await call('school-users:create', request)).toEqual({
      data: { user: SERVER_USER, credential: CREDENTIAL },
      refreshed: true,
    });
    expect(gateway.createSchoolUser).toHaveBeenCalledWith(request);
    expect(gateway.createSchoolUser.mock.invocationCallOrder[0]!).toBeLessThan(refresh.mock.invocationCallOrder[0]!);
  });

  it('update and set-active run the gateway, then refresh', async () => {
    const { gateway, refresh, call } = setup();
    expect(await call('school-users:update', { userId: 'u-1', modules: ['REPORTS'] })).toEqual({
      data: SERVER_USER,
      refreshed: true,
    });
    expect(gateway.updateSchoolUser).toHaveBeenCalledWith({ userId: 'u-1', modules: ['REPORTS'] });
    expect(await call('school-users:set-active', { userId: 'u-1', isActive: false })).toEqual({
      data: SERVER_USER,
      refreshed: true,
    });
    expect(gateway.setSchoolUserActive).toHaveBeenCalledWith({ userId: 'u-1', isActive: false });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('a failed command throws and does not refresh', async () => {
    const { refresh, call } = setup({ fails: true });
    await expect(
      call('school-users:create', { firstName: 'A', lastName: 'B', email: 'a@b.lr', modules: ['STUDENTS'] }),
    ).rejects.toThrow('Email already registered');
    await expect(call('school-users:set-active', { userId: 'u-1', isActive: true })).rejects.toThrow();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('commands validate their request', () => {
    const { call } = setup();
    expect(() => call('school-users:create', { firstName: 'A', lastName: 'B', email: 'a@b.lr', modules: [] })).toThrow();
    expect(() => call('school-users:update', { modules: ['STUDENTS'] })).toThrow();
    expect(() => call('school-users:set-active', { userId: 'u-1' })).toThrow();
  });
});
