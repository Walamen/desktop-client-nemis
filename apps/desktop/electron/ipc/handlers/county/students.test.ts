import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel, StudentAcademicRecord } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerCountyStudentHandlers } from './students';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

const RECORD: StudentAcademicRecord = { years: [], transfers: [] };

function setup(opts: { online?: boolean; fails?: boolean } = {}) {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  const county = {
    listStudents: vi.fn(async () => ({ data: { total: 0 } })),
    getStudent: vi.fn(async () => ({ data: null })),
  };
  const gateway = {
    getStudentAcademicRecord: vi.fn<(countyId: string, studentId: string) => Promise<StudentAcademicRecord>>(async () => {
      if (opts.fails) throw new Error('Provisioning request failed with status 404.');
      return RECORD;
    }),
  };
  registerCountyStudentHandlers(handle, { county } as unknown as ApplicationLayer, {
    gateway,
    isOnline: () => opts.online ?? true,
    countyId: () => 'county-1',
  });
  const call = (channel: string, ...args: unknown[]) => {
    const captured = calls.get(channel)!;
    captured.validate(args);
    return captured.handler(...args);
  };
  return { calls, county, gateway, call };
}

describe('county students channels', () => {
  it('list and detail forward to the County application service', async () => {
    const { county, call } = setup();
    const query = { search: 'ada', status: 'active', page: 2, limit: 12 };
    expect(await call('county:list-students', query)).toEqual({ total: 0 });
    expect(county.listStudents).toHaveBeenCalledWith(query);
    expect(await call('county:get-student', 's-1')).toBeNull();
    expect(county.getStudent).toHaveBeenCalledWith('s-1');
  });

  it('the record is fetched online for the workspace county', async () => {
    const { gateway, call } = setup();
    expect(await call('county:get-student-record', 's-1')).toEqual({ status: 'ok', record: RECORD });
    expect(gateway.getStudentAcademicRecord).toHaveBeenCalledWith('county-1', 's-1');
  });

  it('the record is unavailable offline without calling the server, and on any server failure', async () => {
    const offline = setup({ online: false });
    expect(await offline.call('county:get-student-record', 's-1')).toEqual({ status: 'unavailable' });
    expect(offline.gateway.getStudentAcademicRecord).not.toHaveBeenCalled();
    expect(await setup({ fails: true }).call('county:get-student-record', 's-1')).toEqual({ status: 'unavailable' });
  });

  it('validators refuse malformed requests', () => {
    const { calls } = setup();
    const validate = (channel: string, ...args: unknown[]) => () => calls.get(channel)!.validate(args);
    expect(validate('county:list-students', { page: 1, limit: 51 })).toThrow(IPCError);
    expect(validate('county:list-students', { page: 1, limit: 12, status: 'gone' })).toThrow(IPCError);
    expect(validate('county:list-students', { page: 1, limit: 12, extra: 1 })).toThrow(IPCError);
    expect(validate('county:list-students', { page: 0.5, limit: 12 })).toThrow(IPCError);
    expect(validate('county:get-student', 7)).toThrow(IPCError);
    expect(validate('county:get-student-record')).toThrow(IPCError);
    expect(validate('county:list-students', { page: 1, limit: 12, districtId: 'd-1', performance: 'Good' })).not.toThrow();
  });
});
