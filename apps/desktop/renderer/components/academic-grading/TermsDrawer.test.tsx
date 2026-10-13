import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: { listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })) },
}));

import { TermsDrawer, initialYearId } from './TermsDrawer';
import { clearNemis, field, renderWithLayer, stubNemis, termRow } from './setup-test-support';

const props = (yearId?: string) => ({ isOpen: true, onClose: vi.fn(), onNavigate: vi.fn(), yearId });

afterEach(() => {
  clearNemis();
  vi.restoreAllMocks();
});

describe('initialYearId', () => {
  const years = [{ id: 'y0', isCurrent: false }, { id: 'y1', isCurrent: true }];
  it('uses the requested year when it exists', () => expect(initialYearId(years, 'y0')).toBe('y0'));
  it('falls back to the current year for an unknown request', () => expect(initialYearId(years, 'gone')).toBe('y1'));
  it('falls back to the current year when nothing is requested', () => expect(initialYearId(years, '')).toBe('y1'));
  it('falls back to the first year when none is current', () =>
    expect(initialYearId([{ id: 'a', isCurrent: false }], '')).toBe('a'));
  it('returns empty for no years', () => expect(initialYearId([], 'y0')).toBe(''));
});

describe('TermsDrawer', () => {
  it('only shows the selected year terms', async () => {
    stubNemis({ terms: [termRow(), termRow({ id: 't9', academicYearId: 'y0', name: 'Old Year Term' })] });
    await renderWithLayer(<TermsDrawer {...props()} />);
    expect(await screen.findByText('Term 1')).toBeInTheDocument();
    expect(screen.queryByText('Old Year Term')).toBeNull();
  });

  it('focuses the term name when the create form opens', async () => {
    stubNemis();
    await renderWithLayer(<TermsDrawer {...props()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create term' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Create term' }));
    expect(field('Term name')).toHaveFocus();
  });

  it('opens on the year it was given', async () => {
    stubNemis();
    await renderWithLayer(<TermsDrawer {...props('y0')} />);
    await waitFor(() => expect(field('Academic year')).toHaveValue('y0'));
  });

  it('opens on the current year when the given year is not on this device', async () => {
    stubNemis();
    await renderWithLayer(<TermsDrawer {...props('deleted-year')} />);
    await waitFor(() => expect(field('Academic year')).toHaveValue('y1'));
  });

  it('opens on the current year when no year is given', async () => {
    stubNemis();
    await renderWithLayer(<TermsDrawer {...props()} />);
    await waitFor(() => expect(field('Academic year')).toHaveValue('y1'));
  });

  it('sends the admin to the Academic Years drawer when none exist yet', async () => {
    stubNemis({ years: [] });
    const p = props();
    await renderWithLayer(<TermsDrawer {...p} />);
    expect(await screen.findByText('No academic year yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create term' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Create academic year' }));
    expect(p.onNavigate).toHaveBeenCalledWith('years');
  });

  it('lists the selected year\'s terms', async () => {
    stubNemis({ terms: [termRow()] });
    await renderWithLayer(<TermsDrawer {...props()} />);
    expect(await screen.findByText('Term 1')).toBeInTheDocument();
  });

  it('first Escape leaves the form, second Escape closes the drawer', async () => {
    stubNemis({ terms: [termRow()] });
    const p = props();
    await renderWithLayer(<TermsDrawer {...p} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create term' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Create term' }));
    expect(screen.getByRole('heading', { name: 'Create Term' })).toBeInTheDocument();
    fireEvent.keyDown(field('Term name'), { key: 'Escape' });
    expect(await screen.findByRole('button', { name: 'Create term' })).toBeInTheDocument();
    expect(p.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('creates a term in the selected year and returns to the list', async () => {
    const create = vi.fn(async () => termRow({ id: 't2', name: 'Term 2', sequence: 2, isCurrent: false }));
    stubNemis({ terms: [termRow()], term: { create } });
    await renderWithLayer(<TermsDrawer {...props()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create term' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Create term' }));
    fireEvent.change(field('Term name'), { target: { value: 'Term 2' } });
    fireEvent.change(field('Term position'), { target: { value: '2' } });
    fireEvent.change(field('Start date'), { target: { value: '2026-01-05' } });
    fireEvent.change(field('End date'), { target: { value: '2026-04-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ academicYearId: 'y1', name: 'Term 2', sequence: 2 })));
    expect(await screen.findByRole('button', { name: 'Create term' })).toBeInTheDocument();
  });

  it('stays on the form with the typed values when the save fails', async () => {
    const create = vi.fn(async () => { throw new Error('Dates overlap Term 1'); });
    stubNemis({ terms: [termRow()], term: { create } });
    const p = props();
    await renderWithLayer(<TermsDrawer {...p} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create term' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Create term' }));
    fireEvent.change(field('Term name'), { target: { value: 'Term 2' } });
    fireEvent.change(field('Term position'), { target: { value: '2' } });
    fireEvent.change(field('Start date'), { target: { value: '2026-01-05' } });
    fireEvent.change(field('End date'), { target: { value: '2026-04-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Create Term' })).toBeInTheDocument();
    expect(field('Term name')).toHaveValue('Term 2');
    expect(p.onClose).not.toHaveBeenCalled();
  });
});
