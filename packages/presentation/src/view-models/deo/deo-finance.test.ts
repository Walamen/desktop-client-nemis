import { describe, expect, it } from 'vitest';
import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoFinanceSchool } from '@nemis-desktop/types';
import { createTestApplication } from '../../testing/create-test-application';
import { DeoFinanceViewModel } from './deo-finance-view-model';
import {
  FINANCE_FILTERS,
  auditEntityLabel,
  filterFinanceSchools,
  financeStatusCounts,
  flaggedRateBarClass,
  formatAuditTime,
  formatCompactLrd,
  formatLrd,
  lastPaymentLabel,
} from './deo-finance-views';

const school = (schoolId: string, status: DeoFinanceSchool['status']) => ({ schoolId, status });

describe('DEO Finance helpers (same rules as portal-web lib/deo-finance.ts)', () => {
  const rows = [school('a', 'On Track'), school('b', 'Behind'), school('c', 'No Data'), school('d', 'On Track')];

  it('counts and filters the status pills', () => {
    expect(FINANCE_FILTERS).toEqual(['ALL', 'On Track', 'At Risk', 'Behind', 'No Data']);
    expect(financeStatusCounts(rows)).toEqual({ ALL: 4, 'On Track': 2, 'At Risk': 0, Behind: 1, 'No Data': 1 });
    expect(filterFinanceSchools(rows, 'On Track').map((s) => s.schoolId)).toEqual(['a', 'd']);
    expect(filterFinanceSchools(rows, 'ALL')).toHaveLength(4);
  });

  it.each([
    [80, 'bg-active'],
    [79, 'bg-pending'],
    [30, 'bg-pending'],
    [29, 'bg-error'],
  ])('flagged rate %p bar is %p', (rate, cls) => {
    expect(flaggedRateBarClass(rate)).toBe(cls);
  });

  it('formats money in LRD, the dates and the audit entity as the web does', () => {
    // Intl puts a non-breaking space after the code, on the web too.
    expect(formatLrd(1234567)).toBe('LRD\u00a01,234,567');
    expect(formatCompactLrd(1234567)).toBe('LRD\u00a01M');
    expect(lastPaymentLabel(null)).toBe('No payment yet');
    expect(lastPaymentLabel(new Date(2026, 10, 3, 12).toISOString())).toBe('Nov 03, 2026');
    expect(formatAuditTime(new Date(2026, 10, 3, 14, 5).toISOString())).toBe('Nov 03, 02:05 PM');
    expect(auditEntityLabel('feePayment', '1234567890ab')).toBe('feePayment #12345678');
    expect(auditEntityLabel('feeRule', null)).toBe('feeRule');
  });
});

describe('DeoFinanceViewModel', () => {
  it('loads the finance page and, separately, the audit entries', async () => {
    const { app } = createTestApplication();
    const vm = new DeoFinanceViewModel({ deo: app.deo });
    const loading = vm.loadFinance();
    expect(vm.store.getState().finance.status).toBe('loading');
    expect(vm.store.getState().audit.status).toBe('idle');
    await loading;
    expect(vm.store.getState().finance.status).toBe('success');
    await vm.loadAudit();
    expect(vm.store.getState().audit.status).toBe('success');
  });

  it('moves each part to error on its own', async () => {
    const failing = {
      getFinance: async () => {
        throw new Error('database locked');
      },
      listFinanceAudit: async () => {
        throw new Error('database locked');
      },
    } as unknown as DeoApplicationService;
    const vm = new DeoFinanceViewModel({ deo: failing });
    await vm.loadFinance();
    expect(vm.store.getState().finance.status).toBe('error');
    expect(vm.store.getState().audit.status).toBe('idle');
    await vm.loadAudit();
    expect(vm.store.getState().audit.status).toBe('error');
  });
});
