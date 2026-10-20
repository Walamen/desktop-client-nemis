import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import FeeRulesPage from './page';

const rule = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: `Rule ${id}`, description: null, category: 'TUITION', amount: 1500, currency: 'LRD',
  applicableLevels: ['GRADE_1'], isMandatory: true, isActive: true, ...extra,
});

const rulesPage = (query: { page: number; limit: number }, extra: Record<string, unknown> = {}) => ({
  schools: [
    {
      id: 'sch-a', name: 'Alpha School', ownership: 'MISSION', district: { id: 'd-1', name: 'Buchanan' },
      ownFeeRules: [
        rule('r-1', { applicableLevels: [] }),
        rule('r-2', { applicableLevels: ['GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6'] }),
        rule('r-3', { isActive: false, description: 'Retired fee' }),
      ],
    },
  ],
  total: 25,
  page: query.page,
  limit: query.limit,
  ...extra,
});

function renderWith(listFeeRules = vi.fn(async (query: { page: number; limit: number }) => rulesPage(query))) {
  (window as unknown as { nemis: unknown }).nemis = { county: { listFeeRules } };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <FeeRulesPage />
    </PresentationProvider>,
  );
  return listFeeRules;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('County Fee Rules page', () => {
  it('lists each school with its rules and an Inactive badge for inactive rules', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    expect(screen.getByText('25 schools with fee rules')).toBeInTheDocument();
    expect(screen.getByText('Mission', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Buchanan')).toBeInTheDocument();
    expect(screen.getByText('3 rules')).toBeInTheDocument();
    expect(screen.getAllByText('Active')).toHaveLength(2);
    expect(screen.getByText('Rule r-3').closest('tr')!.textContent).toContain('Inactive');
    expect(screen.getByText('Retired fee')).toBeInTheDocument();
    expect(screen.getByText('Rule r-1').closest('div.bg-white')!.className).toContain('rounded-lg border');
  });

  it('All Levels when a rule has no levels; at most 4 level chips then +N', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    expect(screen.getByText('Rule r-1').closest('tr')!.textContent).toContain('All Levels');
    const many = screen.getByText('Rule r-2').closest('tr')!;
    expect(many.textContent).toContain('G1');
    expect(many.textContent).toContain('G4');
    expect(many.textContent).not.toContain('G5');
    expect(many.textContent).toContain('+2');
  });

  it('filter change on page 2 reloads page 1 once', async () => {
    const listFeeRules = renderWith();
    await waitFor(() => expect(screen.getByText('Page 1 of 3')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(screen.getByText('Page 2 of 3')).toBeInTheDocument());
    listFeeRules.mockClear();
    fireEvent.change(screen.getByDisplayValue('All School Types'), { target: { value: 'MISSION' } });
    await waitFor(() => expect(screen.getByText('Page 1 of 3')).toBeInTheDocument());
    expect(listFeeRules).toHaveBeenCalledTimes(1);
    expect(listFeeRules).toHaveBeenCalledWith({ ownership: 'MISSION', page: 1, limit: 10 });
  });

  it('empty states: no rules vs no match', async () => {
    const empty = vi.fn(async (query: { page: number; limit: number }) => rulesPage(query, { schools: [], total: 0 }));
    renderWith(empty);
    await waitFor(() => expect(screen.getAllByText('No schools have set fee rules yet.')).toHaveLength(2));
    fireEvent.change(screen.getByPlaceholderText('Search by school name…'), { target: { value: 'zzz' } });
    await waitFor(() => expect(screen.getByText('No schools match your filters.')).toBeInTheDocument());
  });

  it('a load error shows the alert', async () => {
    renderWith(vi.fn(async () => Promise.reject(new Error('locked'))));
    await waitFor(() => expect(screen.getByText('Failed to load fee rules.')).toBeInTheDocument());
  });
});
