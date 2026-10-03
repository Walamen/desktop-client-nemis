import { describe, expect, it, vi } from 'vitest';
import type { IpcChannel } from '@nemis-desktop/types';
import { RemoteRejectedError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerRegistryHandlers } from './registry';
import { registerTransferHandlers } from './transfers';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function capture() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  return { calls, handle };
}

const VALID_ID = '482915736045';
const DASHED_ID = '4829-1573-6045';

function registryGateway() {
  return {
    lookupStudent: vi.fn(async () => ({ found: false as const })),
    claimStudent: vi.fn(async () => ({ studentId: 'student-9' })),
    requestRelease: vi.fn(async () => ({ id: 'transfer-1', lapsesAt: '2026-10-16T09:00:00.000Z' })),
  };
}

function transferGateway() {
  return {
    createTransfer: vi.fn(async () => ({ id: 'transfer-2' })),
    reviewTransfer: vi.fn(async () => ({ id: 'transfer-3' })),
    cancelTransfer: vi.fn(async (id: string) => ({ id })),
    searchSchools: vi.fn(async () => [{ id: 'i1', name: 'Central High', code: 'CH' }]),
  };
}

describe('transfer school search', () => {
  it('search-schools validates the query (2..100 chars) and does not refresh', async () => {
    const { calls, handle } = capture();
    const gateway = transferGateway();
    const refresh = vi.fn(async () => true);
    registerTransferHandlers(handle, gateway, refresh);
    const search = calls.get('transfer:search-schools')!;
    expect(() => search.validate(['ce'])).not.toThrow();
    expect(() => search.validate(['c'])).toThrow();
    expect(() => search.validate(['x'.repeat(101)])).toThrow();
    expect(() => search.validate([5])).toThrow();
    expect(await search.handler('cent')).toEqual([{ id: 'i1', name: 'Central High', code: 'CH' }]);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('registry IPC handlers', () => {
  it('lookup validates, normalises the NEMIS ID, and does NOT refresh', async () => {
    const { calls, handle } = capture();
    const gateway = registryGateway();
    const refresh = vi.fn(async () => true);
    registerRegistryHandlers(handle, gateway, refresh);
    const lookup = calls.get('registry:lookup')!;

    expect(() => lookup.validate([{ nemisId: DASHED_ID, dateOfBirth: '2012-01-01' }])).not.toThrow();
    expect(() => lookup.validate([{ nemisId: '482915736046', dateOfBirth: '2012-01-01' }])).toThrow(); // bad checksum
    expect(() => lookup.validate([{ nemisId: VALID_ID, dateOfBirth: 'yesterday' }])).toThrow();
    expect(() => lookup.validate([{ nemisId: VALID_ID, dateOfBirth: '2012-01-01', claimPath: 'IMMEDIATE' }])).toThrow();

    expect(await lookup.handler({ nemisId: DASHED_ID, dateOfBirth: '2012-01-01' })).toEqual({ found: false });
    expect(gateway.lookupStudent).toHaveBeenCalledWith({ nemisId: VALID_ID, dateOfBirth: '2012-01-01' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('claim forwards the normalised request and refreshes after success', async () => {
    const { calls, handle } = capture();
    const gateway = registryGateway();
    const refresh = vi.fn(async () => true);
    registerRegistryHandlers(handle, gateway, refresh);
    const claim = calls.get('registry:claim')!;
    const request = { nemisId: DASHED_ID, dateOfBirth: '2012-01-01', classId: 'class-1', termId: 'term-1', gradeLevel: 'GRADE_7' };

    expect(() => claim.validate([request])).not.toThrow();
    expect(() => claim.validate([{ ...request, gradeLevel: 'GRADE_99' }])).toThrow();
    expect(() => claim.validate([{ ...request, classId: undefined }])).toThrow();

    expect(await claim.handler(request)).toEqual({ data: { studentId: 'student-9' }, refreshed: true });
    expect(gateway.claimStudent).toHaveBeenCalledWith({ ...request, nemisId: VALID_ID });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a rejected command does not refresh, and the error propagates', async () => {
    const { calls, handle } = capture();
    const gateway = registryGateway();
    gateway.claimStudent.mockRejectedValueOnce(new RemoteRejectedError(400, 'A reason is required to override the grade.'));
    const refresh = vi.fn(async () => true);
    registerRegistryHandlers(handle, gateway, refresh);
    await expect(calls.get('registry:claim')!.handler({
      nemisId: VALID_ID, dateOfBirth: '2012-01-01', classId: 'c', termId: 't', gradeLevel: 'GRADE_7',
    })).rejects.toBeInstanceOf(RemoteRejectedError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refresh failure: the command still succeeds, reporting refreshed false', async () => {
    const { calls, handle } = capture();
    registerRegistryHandlers(handle, registryGateway(), vi.fn(async () => { throw new Error('pull failed'); }));
    expect(await calls.get('registry:request')!.handler({
      nemisId: VALID_ID, dateOfBirth: '2012-01-01', classId: 'c', termId: 't', gradeLevel: 'GRADE_7', reason: 'Moving',
    })).toEqual({ data: { id: 'transfer-1', lapsesAt: '2026-10-16T09:00:00.000Z' }, refreshed: false });
  });

  it('request requires a non-empty reason', () => {
    const { calls, handle } = capture();
    registerRegistryHandlers(handle, registryGateway(), vi.fn(async () => true));
    expect(() => calls.get('registry:request')!.validate([{
      nemisId: VALID_ID, dateOfBirth: '2012-01-01', classId: 'c', termId: 't', gradeLevel: 'GRADE_7', reason: '',
    }])).toThrow();
  });
});

describe('transfer IPC handlers', () => {
  it('review accepts only APPROVED/REJECTED and refreshes', async () => {
    const { calls, handle } = capture();
    const gateway = transferGateway();
    const refresh = vi.fn(async () => true);
    registerTransferHandlers(handle, gateway, refresh);
    const review = calls.get('transfer:review')!;

    expect(() => review.validate([{ id: 't-1', status: 'APPROVED', classId: 'c', termId: 't' }])).not.toThrow();
    expect(() => review.validate([{ id: 't-1', status: 'PENDING' }])).toThrow();
    expect(await review.handler({ id: 't-1', status: 'REJECTED', reviewNotes: 'Wrong child' }))
      .toEqual({ data: { id: 'transfer-3' }, refreshed: true });
    expect(gateway.reviewTransfer).toHaveBeenCalledWith({ id: 't-1', status: 'REJECTED', reviewNotes: 'Wrong child' });
  });

  it('cancel takes a single id and refreshes', async () => {
    const { calls, handle } = capture();
    const gateway = transferGateway();
    registerTransferHandlers(handle, gateway, vi.fn(async () => true));
    const cancel = calls.get('transfer:cancel')!;
    expect(() => cancel.validate(['t-1'])).not.toThrow();
    expect(() => cancel.validate([])).toThrow();
    expect(await cancel.handler('t-1')).toEqual({ data: { id: 't-1' }, refreshed: true });
  });

  it('create validates its fields and refreshes', async () => {
    const { calls, handle } = capture();
    const gateway = transferGateway();
    registerTransferHandlers(handle, gateway, vi.fn(async () => true));
    const create = calls.get('transfer:create')!;
    const request = { studentId: 's-1', toInstitutionId: 'school-2', reason: 'Relocation', toGradeLevel: 'GRADE_7' };
    expect(() => create.validate([request])).not.toThrow();
    expect(() => create.validate([{ ...request, toInstitutionId: '' }])).toThrow();
    expect(await create.handler(request)).toEqual({ data: { id: 'transfer-2' }, refreshed: true });
  });
});
