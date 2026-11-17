import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError, RemoteRejectedError, UnauthorizedError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerDeoSettingsHandlers, type DeoSettingsGateway } from './settings';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function setup() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  const deo = { getSettings: vi.fn(async () => ({ data: { districtId: 'd-1' } })) };
  const gateway: DeoSettingsGateway = {
    getDistrictSettings: vi.fn(async () => ({ officeAddress: 'Main' })),
    updateDistrictSettings: vi.fn(async () => null),
  };
  const refresh = vi.fn(async () => true);
  registerDeoSettingsHandlers(handle, { deo } as unknown as ApplicationLayer, gateway, refresh, () => 'd-session');
  const call = (channel: string, ...args: unknown[]) => {
    const captured = calls.get(channel)!;
    captured.validate(args);
    return captured.handler(...args);
  };
  return { gateway, refresh, call };
}

const valid = { firstName: 'Dee', lastName: 'Officer', phoneNumber: '0770', officeAddress: 'Main' };

describe('deo settings channels', () => {
  it('reads the local profile', async () => {
    const { call } = setup();
    expect(await call('deo:settings')).toEqual({ districtId: 'd-1' });
  });

  it("reads the office address online, for the session's district, without a pull", async () => {
    const { gateway, refresh, call } = setup();
    expect(await call('deo:settings-remote')).toEqual({ data: { officeAddress: 'Main' }, refreshed: false });
    expect(gateway.getDistrictSettings).toHaveBeenCalledWith('d-session');
    expect(refresh).not.toHaveBeenCalled();
  });

  it("saves online for the session's district, trimmed, then pulls", async () => {
    const { gateway, refresh, call } = setup();
    const request = { ...valid, firstName: ' Dee ', currentPassword: 'oldpassword', newPassword: 'newpassword' };
    expect(await call('deo:settings-save', request)).toEqual({ data: null, refreshed: true });
    expect(gateway.updateDistrictSettings).toHaveBeenCalledWith('d-session', { ...request, firstName: 'Dee' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['blank name', { ...valid, firstName: '  ' }],
    ['long name', { ...valid, lastName: 'x'.repeat(101) }],
    ['long phone', { ...valid, phoneNumber: '1'.repeat(51) }],
    ['long address', { ...valid, officeAddress: 'x'.repeat(256) }],
    ['new password alone', { ...valid, newPassword: 'newpassword' }],
    ['short new password', { ...valid, currentPassword: 'oldpassword', newPassword: 'short' }],
    ['a district from the renderer', { ...valid, districtId: 'd-other' }],
  ])('refuses %s', (_label, request) => {
    const { call } = setup();
    expect(() => call('deo:settings-save', request)).toThrow(IPCError);
  });

  it('a 401 on a password change means the current password was wrong, and says so', async () => {
    const { gateway, refresh, call } = setup();
    vi.mocked(gateway.updateDistrictSettings).mockRejectedValue(new UnauthorizedError());
    const rejection = call('deo:settings-save', { ...valid, currentPassword: 'wrongpassword', newPassword: 'newpassword' });
    await expect(rejection).rejects.toBeInstanceOf(RemoteRejectedError);
    await expect(rejection).rejects.toMatchObject({ status: 401, remoteMessage: 'Current password is incorrect.' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a 401 without a password change is still a signed-out session', async () => {
    const { gateway, call } = setup();
    vi.mocked(gateway.updateDistrictSettings).mockRejectedValue(new UnauthorizedError());
    await expect(call('deo:settings-save', valid)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('lets the phone and office address be cleared', async () => {
    const { gateway, call } = setup();
    await call('deo:settings-save', { ...valid, phoneNumber: '', officeAddress: '' });
    expect(gateway.updateDistrictSettings).toHaveBeenCalledWith('d-session', { ...valid, phoneNumber: '', officeAddress: '' });
  });

  it('read channels take no arguments', () => {
    const { call } = setup();
    expect(() => call('deo:settings', 'd-2')).toThrow(IPCError);
    expect(() => call('deo:settings-remote', 'd-2')).toThrow(IPCError);
  });
});
