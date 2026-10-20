import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import FinancePage from './page';

const dashboard = (extra: Record<string, unknown> = {}) => ({
  county: { id: 'county-1', name: 'Grand Bassa' },
  academicYearName: '2025/2026',
  totalExpected: 600,
  totalCollected: 350,
  totalOutstanding: 250,
  collectionRate: 58,
  schoolsReporting: 2,
  totalSchools: 3,
  studentsPaid: 1,
  studentsPartial: 2,
  studentsUnpaid: 3,
  currency: 'LRD',
  districtComparison: [
    { districtId: 'd-1', districtName: 'Buchanan', totalExpected: 400, totalCollected: 120, collectionRate: 30, schoolCount: 1 },
    { districtId: 'd-2', districtName: 'Owensgrove', totalExpected: 200, totalCollected: 150, collectionRate: 75, schoolCount: 2 },
  ],
  ...extra,
});

const school = (id: string, name: string, collectionRate: number) => ({
  institutionId: id, institutionName: name, institutionCode: `${id}-CODE`, districtId: 'd-1', districtName: 'Buchanan',
  totalExpected: 100, totalCollected: collectionRate, totalOutstanding: 100 - collectionRate, collectionRate,
  studentCount: 2, paidCount: 1, partialCount: 0, unpaidCount: 1, currency: 'LRD',
});

const paymentsPage = (query: { page: number; limit: number }) => ({
  summary: { totalCollected: 350, totalTransactions: 120, schoolsWithPayments: 2 },
  records: [
    {
      id: `p-${query.page}`, studentName: 'Mary Kollie', nemisId: '123456789012', schoolName: 'Alpha School',
      schoolOwnership: 'PRIVATE', districtName: 'Buchanan', feeRuleName: 'Tuition', amountPaid: 100,
      method: 'MOBILE_MONEY', reference: null, paidAt: '2026-03-05T10:00:00.000Z',
    },
  ],
  total: 120,
  page: query.page,
  limit: query.limit,
});

function renderWith(overrides: Record<string, unknown> = {}) {
  const county = {
    getFinanceDashboard: vi.fn(async () => dashboard()),
    listFinanceSchools: vi.fn(async () => [school('a', 'Alpha School', 50), school('b', 'Beta School', 80), school('n', 'Nowhere School', 10)]),
    listFeeCollections: vi.fn(async (query: { page: number; limit: number }) => paymentsPage(query)),
    ...overrides,
  };
  (window as unknown as { nemis: unknown }).nemis = { county };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <FinancePage />
    </PresentationProvider>,
  );
  return county;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

const card = (label: string) => screen.getByText(label, { selector: 'p' }).parentElement!.textContent;

describe('County Finance page', () => {
  it('shows the county name and the shared academic year', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    expect(screen.getByText('Academic Year')).toBeInTheDocument();
    expect(screen.getByText('2025/2026')).toBeInTheDocument();
    expect(screen.queryByText('Period')).not.toBeInTheDocument();
  });

  it('says "Current academic year" when schools do not share one', async () => {
    renderWith({ getFinanceDashboard: vi.fn(async () => dashboard({ academicYearName: null })) });
    await waitFor(() => expect(screen.getByText('Current academic year')).toBeInTheDocument());
  });

  it('cards show totals, rate and schools reporting', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    expect(card('Total Collected')).toContain('LRD');
    expect(card('Total Collected')).toContain('350.00');
    expect(card('Collection Rate')).toContain('58%');
    expect(card('Schools Reporting')).toContain('2/3');
    expect(card('Paid in Full')).toContain('1');
    expect(card('Partially Paid')).toContain('2');
    expect(card('No Payment Yet')).toContain('3');
  });

  it('districts sorted by rate, Below Target under 40', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Owensgrove')).toBeInTheDocument());
    const names = screen.getAllByText(/^(Buchanan|Owensgrove)$/).map((el) => el.textContent);
    expect(names).toEqual(['Owensgrove', 'Buchanan']);
    expect(screen.getAllByText('Below Target')).toHaveLength(1);
    expect(screen.getByText('2 schools')).toBeInTheDocument();
    expect(screen.getByText('1 school')).toBeInTheDocument();
  });

  it('All Schools sorts worst first and labels On Track / At Risk / Below Target', async () => {
    const county = renderWith();
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    expect(county.listFinanceSchools).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'All Schools' }));
    await waitFor(() => expect(screen.getByText('Nowhere School')).toBeInTheDocument());
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.querySelector('p')!.textContent)).toEqual(['Nowhere School', 'Alpha School', 'Beta School']);
    expect(rows[0]!.textContent).toContain('Below Target');
    expect(rows[1]!.textContent).toContain('At Risk');
    expect(rows[2]!.textContent).toContain('On Track');
  });

  it('the district filter is offered before All Schools is opened', async () => {
    const county = renderWith();
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
    await waitFor(() => expect(screen.getByText('Mary Kollie')).toBeInTheDocument());
    expect(county.listFinanceSchools).not.toHaveBeenCalled();
    const districtSelect = screen.getByDisplayValue('All Districts');
    expect(within(districtSelect).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'All Districts',
      'Buchanan',
      'Owensgrove',
    ]);
  });

  it('payment rows show the student, NEMIS ID, school, method and date', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
    await waitFor(() => expect(screen.getByText('Mary Kollie')).toBeInTheDocument());
    const row = screen.getByText('Mary Kollie').closest('tr')!;
    expect(row.textContent).toContain('Private');
    expect(row.textContent).toContain('Tuition');
    expect(row.textContent).toContain('Mobile Money');
    expect(row.textContent).toContain('March 5, 2026');
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('changing a filter on page 2 reloads page 1 once', async () => {
    const county = renderWith();
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
    await waitFor(() => expect(screen.getByText('Page 1 of 3')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(screen.getByText('Page 2 of 3')).toBeInTheDocument());
    county.listFeeCollections.mockClear();
    fireEvent.change(screen.getByDisplayValue('All School Types'), { target: { value: 'PRIVATE' } });
    await waitFor(() => expect(screen.getByText('Page 1 of 3')).toBeInTheDocument());
    expect(county.listFeeCollections).toHaveBeenCalledTimes(1);
    expect(county.listFeeCollections).toHaveBeenCalledWith({ ownership: 'PRIVATE', page: 1, limit: 50 });
  });

  it('a load error shows the alert', async () => {
    renderWith({ getFinanceDashboard: vi.fn(async () => Promise.reject(new Error('locked'))) });
    await waitFor(() => expect(screen.getByText('Failed to load finance data. Please try again.')).toBeInTheDocument());
  });
});
