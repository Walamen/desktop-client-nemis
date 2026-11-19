import { describe, expect, it } from 'vitest';
import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoSchoolDetailResult } from '@nemis-desktop/types';
import { DeoSchoolDetailViewModel } from './deo-school-detail-view-model';

describe('DeoSchoolDetailViewModel', () => {
  it('records the requested id and loads the detail', async () => {
    const result: DeoSchoolDetailResult = { districtId: 'd-1', school: null };
    const deo = { getSchool: async () => ({ data: result }) } as unknown as DeoApplicationService;
    const vm = new DeoSchoolDetailViewModel({ deo });
    await vm.load('s-1');
    expect(vm.store.getState().requestedId).toBe('s-1');
    expect(vm.store.getState().detail).toEqual({ status: 'success', data: result });
  });

  it('moves to error when the service fails', async () => {
    const deo = {
      getSchool: async () => {
        throw new Error('database locked');
      },
    } as unknown as DeoApplicationService;
    const vm = new DeoSchoolDetailViewModel({ deo });
    await vm.load('s-1');
    expect(vm.store.getState().detail.status).toBe('error');
  });
});
