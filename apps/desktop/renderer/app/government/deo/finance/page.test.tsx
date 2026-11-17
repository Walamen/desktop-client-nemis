import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DeoFinanceAuditEntry, DeoFinanceResult, DeoFinanceSchool } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DeoFinancePage from './page';

function school(
  schoolId: string,
  schoolName: string,
  allocation: number,
  collected: number,
  status: DeoFinanceSchool['status'],
): DeoFinanceSchool {
  return {
    schoolId,
    schoolName,
    schoolCode: schoolId.toUpperCase(),
    principalName: 'Ann First',
    allocation,
    collected,
    outstanding: Math.max(allocation - collected, 0),
    complianceRate: allocation > 0 ? Math.round((collected / allocation) * 100) : 0,
    studentCount: 12,
    lastPaymentAt: null,
    status,
  };
}

const SCHOOLS = [
  school('a', 'Alpha Academy', 100, 100, 'On Track'),
  school('b', 'Beta High', 100, 90, 'On Track'),
  school('c', 'Gamma School', 100, 20, 'Behind'),
  school('d', 'Delta Primary', 0, 0, 'No Data'),
];

const RESULT: DeoFinanceResult = {
  districtId: 'd-1',
  district: { id: 'd-1', name: 'Owensgrove' },
  county: { id: 'c-1', name: 'Grand Bassa' },
  summary: {
    totalAllocation: 300,
    totalCollected: 210,
    totalOutstanding: 90,
    complianceRate: 70,
    schoolsBilling: 3,
    schoolsBehind: 1,
  },
  trend: [{ period: 'Nov', amount: 210 }],
  schools: SCHOOLS,
  flagged: [
    { schoolId: 'c', schoolName: 'Gamma School', schoolCode: 'C', expected: 100, collected: 20, outstanding: 80, collectionRate: 20, isFlagged: true },
    { schoolId: 'b', schoolName: 'Beta High', schoolCode: 'B', expected: 100, collected: 90, outstanding: 10, collectionRate: 90, isFlagged: false },
  ],
};

const AUDIT: DeoFinanceAuditEntry[] = [
  {
    id: 'e-1',
    timestamp: '2026-11-17T10:00:00.000Z',
    actorName: 'Ama Bursar',
    action: 'CREATE',
    entityType: 'feePayment',
    entityId: '1234567890ab',
  },
];

function mockNemis(getFinance: () => Promise<DeoFinanceResult>) {
  const deo = { getFinance: vi.fn(getFinance), listFinanceAudit: vi.fn(async () => AUDIT) };
  (window as unknown as { nemis: unknown }).nemis = { deo };
  return deo;
}

function renderPage() {
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <DeoFinancePage />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('DEO Finance page', () => {
  it('names the district, says the year scope and shows the KPIs', async () => {
    mockNemis(async () => RESULT);
    renderPage();
    expect(await screen.findByText('Finance Monitoring')).toBeTruthy();
    expect(screen.getByText('Owensgrove · Grand Bassa')).toBeTruthy();
    expect(screen.getByText('Current academic year')).toBeTruthy();
    expect(screen.getByText('District Allocation')).toBeTruthy();
    // The rate shows on its KPI card and on the Budget Utilization bar.
    expect(screen.getByText('Collection Rate', { selector: 'p' }).previousElementSibling?.textContent).toBe('70%');
    expect(screen.getAllByText('70%')).toHaveLength(2);
  });

  it('counts and filters the schools by status', async () => {
    mockNemis(async () => RESULT);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'On Track (2)' }));
    expect(screen.getByRole('button', { name: 'ALL (4)' })).toBeTruthy();
    expect(screen.getByText('Alpha Academy')).toBeTruthy();
    expect(screen.queryByText('Gamma School')).toBeNull();
  });

  it('lists flagged activity with Flagged and Monitor chips', async () => {
    mockNemis(async () => RESULT);
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Flagged Activity' }));
    expect(screen.getByText('Schools with a collection rate below 30% are flagged for follow-up.')).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Gamma School')).toBeTruthy();
    expect(within(rows[0]!).getByText('Flagged')).toBeTruthy();
    expect(within(rows[1]!).getByText('Monitor')).toBeTruthy();
  });

  it('loads the audit entries only when the Audit Logs tab opens', async () => {
    const deo = mockNemis(async () => RESULT);
    renderPage();
    await screen.findByText('Finance Monitoring');
    expect(deo.listFinanceAudit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Audit Logs' }));
    expect(await screen.findByText('Ama Bursar')).toBeTruthy();
    expect(screen.getByText('feePayment #12345678')).toBeTruthy();
    expect(deo.listFinanceAudit).toHaveBeenCalledTimes(1);
  });

  it('shows only the error with Retry when loading fails', async () => {
    let fail = true;
    const deo = mockNemis(async () => {
      if (fail) throw new Error('database locked');
      return RESULT;
    });
    renderPage();
    expect(await screen.findByText('Failed to load district finance data.')).toBeTruthy();
    expect(screen.queryByText('District Allocation')).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('District Allocation')).toBeTruthy();
    expect(deo.getFinance).toHaveBeenCalledTimes(2);
  });

  it('says so when no district is assigned', async () => {
    mockNemis(async () => ({ ...RESULT, districtId: null, district: null, county: null, schools: [], flagged: [] }));
    renderPage();
    expect(await screen.findByText('No district assigned to your account.')).toBeTruthy();
  });
});
