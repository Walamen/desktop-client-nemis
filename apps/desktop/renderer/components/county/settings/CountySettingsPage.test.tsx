import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { CountySettingsPage } from './CountySettingsPage';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const CREATED = '2020-01-01T00:00:00.000Z';
const UPDATED = '2026-01-15T00:00:00.000Z';

function renderWith(settings: unknown) {
  const county = { getCountySettings: vi.fn(async () => settings) };
  (window as unknown as { nemis: unknown }).nemis = { county };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <CountySettingsPage />
    </PresentationProvider>,
  );
  return county;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

const item = (label: string) => screen.getByText(`${label}:`, { selector: 'strong' }).parentElement!.textContent;

describe('County Settings page', () => {
  it('County Information comes from this device', async () => {
    renderWith({
      county: { id: 'c-1', name: 'Grand Bassa', code: 'GB', isActive: true, createdAt: CREATED, updatedAt: UPDATED },
      districtCount: 3,
      schoolCount: 12,
    });
    await waitFor(() => expect(item('County')).toBe('County: Grand Bassa'));
    expect(item('Code')).toBe('Code: GB');
    expect(item('Districts')).toBe('Districts: 3');
    expect(item('Schools')).toBe('Schools: 12');
    expect(screen.getByText('Active').className).toContain('text-success');
    expect(item('Office')).toBe('Office: Grand Bassa County Education Office');
    expect(item('Created')).toBe(`Created: ${new Date(CREATED).toLocaleDateString()}`);
    expect(item('Last Updated')).toBe(`Last Updated: ${new Date(UPDATED).toLocaleDateString()}`);
    expect((screen.getByDisplayValue('Grand Bassa') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('link', { name: 'Back to Dashboard' }).getAttribute('href')).toBe('/government/county');
  });

  it('not synced yet: N/A and zero counts', async () => {
    renderWith({ county: null, districtCount: 0, schoolCount: 0 });
    await waitFor(() => expect(item('County')).toBe('County: N/A'));
    expect(item('Code')).toBe('Code: N/A');
    expect(item('Districts')).toBe('Districts: 0');
    expect(item('Schools')).toBe('Schools: 0');
    expect(item('Created')).toBe('Created: N/A');
    expect(screen.getByText('Inactive').className).toContain('text-error');
  });

  it('the coming-soon controls do nothing', async () => {
    const county = renderWith({ county: null, districtCount: 0, schoolCount: 0 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument());
    for (const name of ['Save Changes', 'Cancel', 'Change Password', 'Two-Factor Auth', 'Login History']) {
      fireEvent.click(screen.getByRole('button', { name }));
    }
    expect(county.getCountySettings).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText('admin@grandbassa.gov.lr')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').map((c) => (c as HTMLInputElement).checked)).toEqual([true, true, false]);
  });
});
