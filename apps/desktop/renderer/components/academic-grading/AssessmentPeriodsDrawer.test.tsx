import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })),
    saveSchoolAdminRecord: vi.fn(),
    deleteSchoolAdminRecord: vi.fn(),
  },
}));

import { AssessmentPeriodsDrawer } from './AssessmentPeriodsDrawer';
import { CURRENT_YEAR, clearNemis, field, renderWithLayer, stubNemis, termRow } from './setup-test-support';

afterEach(() => clearNemis());

describe('AssessmentPeriodsDrawer', () => {
  it('shows the periods panel and routes its prompts to other drawers', async () => {
    stubNemis({ currentYear: CURRENT_YEAR, terms: [] });
    const onNavigate = vi.fn();
    await renderWithLayer(<AssessmentPeriodsDrawer isOpen onClose={vi.fn()} onNavigate={onNavigate} />);
    expect(screen.getByRole('heading', { name: 'Assessment Periods' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Create terms' }));
    expect(onNavigate).toHaveBeenCalledWith('terms');
  });

  it('Escape in the period form closes the form, not the drawer', async () => {
    stubNemis({ currentYear: CURRENT_YEAR, terms: [termRow({ academicYearId: CURRENT_YEAR.id })] });
    const onClose = vi.fn();
    await renderWithLayer(<AssessmentPeriodsDrawer isOpen onClose={onClose} onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByText('Term 1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Add Period' }));
    expect(screen.getByRole('heading', { name: 'Create New Period' })).toBeInTheDocument();
    fireEvent.keyDown(field('Period Name'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create New Period' })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });
});
