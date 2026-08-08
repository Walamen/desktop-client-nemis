import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IpcChannels } from '@nemis-desktop/types';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerInstitutionHandlers } from './institutions';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function makeHarness() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  return { calls, handle };
}

describe('registerInstitutionHandlers', () => {
  it('registers institution:list backed by app.institution.listInstitutions', async () => {
    const { calls, handle } = makeHarness();
    const listInstitutions = vi.fn().mockResolvedValue({ data: [{ id: 'inst-1' }] });
    const app = { institution: { listInstitutions } } as unknown as ApplicationLayer;

    registerInstitutionHandlers(handle, app);
    const call = calls.get(IpcChannels.INSTITUTION_LIST)!;
    const result = await call.handler();

    expect(listInstitutions).toHaveBeenCalledOnce();
    expect(result).toEqual([{ id: 'inst-1' }]);
    expect(() => call.validate(['unexpected'])).toThrow();
  });
});
