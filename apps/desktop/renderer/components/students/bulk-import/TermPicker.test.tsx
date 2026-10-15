import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { TermPicker, type TermValue } from './TermPicker';

const currentYear = {
  id: 'y1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31',
  isCurrent: true, status: 'ACTIVE', termCount: 1, classCount: 1,
};
const pastYear = { ...currentYear, id: 'y0', code: '2024/2025', isCurrent: false, status: 'CLOSED' };
const term1 = { id: 't1', academicYearId: 'y1', name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-15', isCurrent: true };
const oldTerm = { ...term1, id: 't0', academicYearId: 'y0', name: 'Old Term' };

function stubNemis({ years = async () => [currentYear] as unknown[], terms = async () => [term1] as unknown[] } = {}) {
  const termsList = vi.fn(terms);
  (window as unknown as { nemis: unknown }).nemis = {
    school: { getSummary: vi.fn(async () => ({ id: 'inst-1', code: 'S1', name: 'Test School', type: 'PUBLIC', ownership: 'GOVERNMENT', approvalStatus: 'APPROVED', isApproved: true })) },
    academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(years) },
    term: { getCurrent: vi.fn(async () => null), list: termsList },
    classes: { list: vi.fn(async () => ({ items: [], total: 0 })) },
  };
  return { termsList };
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

function Harness({ onChange }: { onChange: (v: TermValue) => void }) {
  const [value, setValue] = useState<TermValue>({ academicYearId: '', termId: '' });
  return <TermPicker value={value} onChange={(next) => { onChange(next); setValue(next); }} />;
}

async function renderPicker() {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  const onChange = vi.fn();
  render(<PresentationProvider layer={layer}><Harness onChange={onChange} /></PresentationProvider>);
  return { onChange, user: userEvent.setup({ delay: null }) };
}

function termSelect(): HTMLSelectElement {
  const label = Array.from(document.querySelectorAll('label')).find((l) => /^term/i.test(l.textContent ?? ''));
  const select = label?.parentElement?.querySelector('select');
  if (!(select instanceof HTMLSelectElement)) throw new Error('no Term select');
  return select;
}

describe('TermPicker', () => {
  it("shows the current year and reports it with the chosen term", async () => {
    stubNemis();
    const { onChange, user } = await renderPicker();
    expect(await screen.findByText('Academic year: 2025/2026')).toBeInTheDocument();
    await waitFor(() => expect(termSelect().querySelector('option[value="t1"]')).not.toBeNull());
    await user.selectOptions(termSelect(), 't1');
    expect(onChange).toHaveBeenLastCalledWith({ academicYearId: 'y1', termId: 't1' });
  });

  it("lists only the current year's terms", async () => {
    stubNemis({ years: async () => [pastYear, currentYear], terms: async () => [term1, oldTerm] });
    await renderPicker();
    await waitFor(() => expect(termSelect().querySelector('option[value="t1"]')).not.toBeNull());
    expect(termSelect().querySelector('option[value="t0"]')).toBeNull();
  });

  it('says so when there is no current academic year', async () => {
    stubNemis({ years: async () => [pastYear] });
    await renderPicker();
    expect(await screen.findByText(/There is no current academic year on this device/)).toBeInTheDocument();
  });

  it('says to create a term when the year has none', async () => {
    stubNemis({ terms: async () => [] });
    await renderPicker();
    expect(await screen.findByText(/No terms in this academic year/)).toBeInTheDocument();
  });

  it('offers a retry when terms fail to load, without the "create one" hint', async () => {
    const { termsList } = stubNemis({ terms: async () => { throw new Error('[DB_ERROR] boom'); } });
    const { user } = await renderPicker();
    expect(await screen.findByText(/Couldn.t load terms/)).toBeInTheDocument();
    expect(screen.queryByText(/No terms in this academic year/)).not.toBeInTheDocument();
    termsList.mockResolvedValue([term1]);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(termSelect().querySelector('option[value="t1"]')).not.toBeNull());
  });
});
