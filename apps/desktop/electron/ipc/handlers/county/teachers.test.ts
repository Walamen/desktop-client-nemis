import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerCountyTeacherHandlers } from './teachers';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function setup() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  const county = {
    listTeachers: vi.fn(async () => ({ data: { total: 0 } })),
    getTeacher: vi.fn(async () => ({ data: null })),
  };
  registerCountyTeacherHandlers(handle, { county } as unknown as ApplicationLayer);
  const call = (channel: string, ...args: unknown[]) => {
    const captured = calls.get(channel)!;
    captured.validate(args);
    return captured.handler(...args);
  };
  return { county, call };
}

describe('county teachers channels', () => {
  it('list and profile forward to the County application service', async () => {
    const { county, call } = setup();
    const query = { search: 'musu', category: 'PRIMARY', subject: 'English', status: 'active', page: 2, limit: 12 };
    expect(await call('county:list-teachers', query)).toEqual({ total: 0 });
    expect(county.listTeachers).toHaveBeenCalledWith(query);
    expect(await call('county:get-teacher', 't-1')).toBeNull();
    expect(county.getTeacher).toHaveBeenCalledWith('t-1');
  });

  it('refuses a page larger than 50, an unknown key, a bad status and a missing id', () => {
    const { call } = setup();
    expect(() => call('county:list-teachers', { page: 1, limit: 51 })).toThrow(IPCError);
    expect(() => call('county:list-teachers', { page: 1, limit: 12, districtId: 'd-1' })).toThrow(IPCError);
    expect(() => call('county:list-teachers', { page: 1, limit: 12, status: 'retired' })).toThrow(IPCError);
    expect(() => call('county:get-teacher')).toThrow(IPCError);
  });
});
