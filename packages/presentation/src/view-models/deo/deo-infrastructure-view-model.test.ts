import { describe, expect, it } from 'vitest';
import type { DeoApplicationService } from '@nemis-desktop/application';
import { DeoInfrastructureViewModel } from './deo-infrastructure-view-model';

const RESULT = {
  districtId: 'd-1',
  district: null,
  county: null,
  summary: { totalIssues: 0, critical: 0, open: 0, escalated: 0 },
  issues: [],
};

const SAVE_ERROR = "Couldn't save this action. Try again.";

function makeDeo(reply: () => Promise<boolean>) {
  const loads: number[] = [];
  const sent: Array<[string, unknown]> = [];
  const call = (kind: string) => async (req: unknown) => {
    sent.push([kind, req]);
    return { data: await reply() };
  };
  const deo = {
    getInfrastructure: async () => {
      loads.push(1);
      return { data: RESULT };
    },
    reviewInfrastructure: call('review'),
    resolveInfrastructure: call('resolve'),
    escalateInfrastructure: call('escalate'),
  } as unknown as DeoApplicationService;
  return { deo, loads, sent };
}

describe('DeoInfrastructureViewModel', () => {
  it('loads the infrastructure result', async () => {
    const { deo } = makeDeo(async () => true);
    const vm = new DeoInfrastructureViewModel({ deo });
    expect(vm.store.getState()).toMatchObject({ acting: false, actionError: null });
    await vm.load();
    expect(vm.store.getState().infrastructure.status).toBe('success');
  });

  it('act succeeds, reloads and returns true', async () => {
    const { deo, loads, sent } = makeDeo(async () => true);
    const vm = new DeoInfrastructureViewModel({ deo });
    expect(await vm.act('review', 'i-1', 'looking')).toBe(true);
    expect(sent).toEqual([['review', { issueId: 'i-1', comments: 'looking' }]]);
    expect(loads).toHaveLength(1);
    expect(vm.store.getState()).toMatchObject({ acting: false, actionError: null });
  });

  it('omits comments when no text is given and maps escalate to reason', async () => {
    const { deo, sent } = makeDeo(async () => true);
    const vm = new DeoInfrastructureViewModel({ deo });
    await vm.act('resolve', 'i-1');
    await vm.act('escalate', 'i-2');
    await vm.act('escalate', 'i-3', 'why');
    expect(sent).toEqual([
      ['resolve', { issueId: 'i-1' }],
      ['escalate', { issueId: 'i-2', reason: '' }],
      ['escalate', { issueId: 'i-3', reason: 'why' }],
    ]);
  });

  it('a false reply sets actionError and returns false', async () => {
    const { deo } = makeDeo(async () => false);
    const vm = new DeoInfrastructureViewModel({ deo });
    expect(await vm.act('resolve', 'i-1')).toBe(false);
    expect(vm.store.getState().actionError).toBe(SAVE_ERROR);
    expect(vm.store.getState().acting).toBe(false);
  });

  it('a rejection sets actionError and returns false', async () => {
    const { deo } = makeDeo(async () => {
      throw new Error('boom');
    });
    const vm = new DeoInfrastructureViewModel({ deo });
    expect(await vm.act('review', 'i-1')).toBe(false);
    expect(vm.store.getState().actionError).toBe(SAVE_ERROR);
  });

  it('a rejection still reloads the list', async () => {
    const { deo, loads } = makeDeo(async () => {
      throw new Error('boom');
    });
    const vm = new DeoInfrastructureViewModel({ deo });
    expect(await vm.act('review', 'i-1')).toBe(false);
    expect(loads).toHaveLength(1);
    expect(vm.store.getState()).toMatchObject({ acting: false, actionError: SAVE_ERROR });
  });

  it('a false reply still reloads the list', async () => {
    const { deo, loads } = makeDeo(async () => false);
    const vm = new DeoInfrastructureViewModel({ deo });
    await vm.act('review', 'i-1');
    expect(loads).toHaveLength(1);
  });

  it('clearActionError resets it', async () => {
    const { deo } = makeDeo(async () => false);
    const vm = new DeoInfrastructureViewModel({ deo });
    await vm.act('review', 'i-1');
    vm.clearActionError();
    expect(vm.store.getState().actionError).toBeNull();
  });

  it('ignores a second act while one is running', async () => {
    const { deo, sent } = makeDeo(async () => true);
    const vm = new DeoInfrastructureViewModel({ deo });
    const [a, b] = await Promise.all([vm.act('review', 'i-1'), vm.act('review', 'i-2')]);
    expect([a, b]).toEqual([true, false]);
    expect(sent).toHaveLength(1);
  });
});
