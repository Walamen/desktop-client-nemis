import { describe, expect, it } from 'vitest';
import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoReportsComplianceResult } from '@nemis-desktop/types';
import { DeoReportsComplianceViewModel } from './deo-reports-compliance-view-model';

describe('DeoReportsComplianceViewModel', () => {
  it('loads the compliance result', async () => {
    const result = { items: [] } as unknown as DeoReportsComplianceResult;
    const deo = {
      getReportsCompliance: async () => ({ data: result }),
    } as unknown as DeoApplicationService;
    const vm = new DeoReportsComplianceViewModel({ deo });
    expect(vm.store.getState().compliance.status).toBe('idle');
    const loading = vm.load();
    expect(vm.store.getState().compliance.status).toBe('loading');
    await loading;
    const state = vm.store.getState().compliance;
    expect(state.status).toBe('success');
    if (state.status !== 'success') return;
    expect(state.data).toEqual(result);
  });

  it('moves to error when the service fails', async () => {
    const deo = {
      getReportsCompliance: async () => {
        throw new Error('database locked');
      },
    } as unknown as DeoApplicationService;
    const vm = new DeoReportsComplianceViewModel({ deo });
    await vm.load();
    expect(vm.store.getState().compliance.status).toBe('error');
  });
});
