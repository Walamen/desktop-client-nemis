import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DashboardPage from './page';

describe('School Admin dashboard', () => {
  it('renders the real seeded student total', async () => {
    const layer = await createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <DashboardPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Total Students')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
    // Placeholder tiles are marked
    expect(screen.getAllByText(/sample/i).length).toBeGreaterThan(0);
  });
});
