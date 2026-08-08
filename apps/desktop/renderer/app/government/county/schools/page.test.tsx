import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import CountySchoolsPage from './page';

function mockNemis(institutions: unknown[]) {
  (window as unknown as { nemis: unknown }).nemis = {
    institution: { list: vi.fn(async () => institutions) },
  };
}
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('County Schools page', () => {
  it('shows the empty state when no institutions have synced yet', async () => {
    mockNemis([]);
    const layer = createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <CountySchoolsPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('No schools found matching your criteria.')).toBeInTheDocument());
  });

  it('renders a synced institution with its district and enrollment', async () => {
    mockNemis([{
      id: 'inst-1', code: 'SCH-1', name: 'Monrovia Central', type: 'SECONDARY',
      ownership: 'PUBLIC', districtId: 'district-1', districtName: 'Sinkor District',
      approvalStatus: 'APPROVED', studentCount: 42,
    }]);
    const layer = createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <CountySchoolsPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Monrovia Central')).toBeInTheDocument());
    expect(screen.getByText('Sinkor District')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});
