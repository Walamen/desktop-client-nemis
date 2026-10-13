import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })),
    saveSchoolAdminRecord: vi.fn(),
    deleteSchoolAdminRecord: vi.fn(),
  },
}));

import { AssessmentPeriodsDrawer } from './AssessmentPeriodsDrawer';
import { CURRENT_YEAR, clearNemis, renderWithLayer, stubNemis } from './setup-test-support';

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
});
