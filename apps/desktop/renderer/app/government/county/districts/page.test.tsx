import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DistrictsManagementPage from './page';

const push = vi.fn();
const confirm = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@nemis-desktop/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nemis-desktop/ui')>()),
  showConfirm: (...args: unknown[]) => confirm(...args),
}));

const deo = (id: string, first: string, districtId: string | null) => ({
  id, firstName: first, lastName: 'Kollie', email: `${id}@moe.gov.lr`, phoneNumber: null,
  isActive: true, lastLoginAt: null, photoUrl: null, districtId,
});

const DATA = {
  county: { id: 'county-1', name: 'Grand Bassa' },
  districts: [
    {
      id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true, activeSchoolCount: 4, activeDeoCount: 1,
      firstDeo: { userId: 'deo-1', firstName: 'Musu', lastName: 'Kollie', email: 'deo-1@moe.gov.lr', photoUrl: null },
    },
    { id: 'd-2', name: 'Owensgrove', code: 'D2', isActive: true, activeSchoolCount: 2, activeDeoCount: 0, firstDeo: null },
  ],
  deoUsers: [deo('deo-1', 'Musu', 'd-1'), deo('deo-2', 'Bendu', null)],
  officersByDistrict: {
    'd-1': [{ userId: 'deo-1', name: 'Musu Kollie', email: 'deo-1@moe.gov.lr', phoneNumber: null, isActive: true, lastLoginAt: null, photoUrl: null }],
    'd-2': [],
  },
};

function mockNemis(overrides: Record<string, unknown> = {}) {
  const nemis = {
    county: {
      listDistricts: vi.fn(async () => DATA),
      assignDeo: vi.fn(async () => ({ data: null, refreshed: true })),
      removeDeo: vi.fn(async () => ({ data: null, refreshed: true })),
      ...overrides,
    },
  };
  (window as unknown as { nemis: unknown }).nemis = nemis;
  return nemis;
}

/** The Drawer has no dialog role; its title h2 sits inside the fixed panel. */
function drawer(): HTMLElement {
  return screen.getByRole('heading', { name: /Manage DEO/ }).closest('.fixed') as HTMLElement;
}

function renderPage(online = true) {
  const layer = createRendererPresentation();
  layer.stores.connectivity.setOnline(online);
  render(
    <PresentationProvider layer={layer}>
      <DistrictsManagementPage />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  push.mockReset();
  confirm.mockClear();
});

describe('County District Management page', () => {
  it('renders the header, stat cards and district cards', async () => {
    mockNemis();
    renderPage();
    await waitFor(() => expect(screen.getByText('District Management')).toBeInTheDocument());
    expect(screen.getByText('Grand Bassa')).toBeInTheDocument();
    expect(screen.getByText('Musu Kollie')).toBeInTheDocument();
    expect(screen.getByText('No DEO assigned')).toBeInTheDocument();
    expect(screen.getByText('Total Schools').parentElement!.textContent).toContain('6');
  });

  it('toggles to the table view', async () => {
    mockNemis();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Table view')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Table view'));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('View Details routes to the detail page with the id in the query', async () => {
    mockNemis();
    renderPage();
    await waitFor(() => expect(screen.getAllByText('View Details').length).toBe(2));
    fireEvent.click(screen.getAllByText('View Details')[0]!);
    expect(push).toHaveBeenCalledWith('/government/county/districts/details?id=d-1');
  });

  it('assigns a DEO to a district with none, without asking to replace', async () => {
    const nemis = mockNemis();
    renderPage();
    await waitFor(() => expect(screen.getByText('Assign DEO')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Assign DEO'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'deo-2' } });
    fireEvent.click(within(drawer()).getAllByText('Assign DEO').at(-1)!);
    await waitFor(() =>
      expect(nemis.county.assignDeo).toHaveBeenCalledWith({ districtId: 'd-2', userId: 'deo-2', replaceExisting: false }),
    );
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks before replacing the current DEO', async () => {
    const nemis = mockNemis();
    renderPage();
    await waitFor(() => expect(screen.getByText('Reassign DEO')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Reassign DEO'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'deo-2' } });
    fireEvent.click(within(drawer()).getAllByText('Reassign DEO').at(-1)!);
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    await waitFor(() =>
      expect(nemis.county.assignDeo).toHaveBeenCalledWith({ districtId: 'd-1', userId: 'deo-2', replaceExisting: true }),
    );
  });

  it('removes the current DEO after confirmation', async () => {
    const nemis = mockNemis();
    renderPage();
    await waitFor(() => expect(screen.getByText('Reassign DEO')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Reassign DEO'));
    fireEvent.click(screen.getByText('Remove from District'));
    await waitFor(() => expect(nemis.county.removeDeo).toHaveBeenCalledWith({ districtId: 'd-1', userId: 'deo-1' }));
  });

  it("shows the server's refusal in the drawer", async () => {
    mockNemis({
      assignDeo: vi.fn(async () => {
        throw new Error('[REMOTE_REJECTED] This district already has an assigned DEO (Musu Kollie).');
      }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Assign DEO')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Assign DEO'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'deo-2' } });
    fireEvent.click(within(drawer()).getAllByText('Assign DEO').at(-1)!);
    await waitFor(() =>
      expect(screen.getByText('This district already has an assigned DEO (Musu Kollie).')).toBeInTheDocument(),
    );
  });

  it('tells the admin the change is saved when the follow-up sync could not run', async () => {
    mockNemis({
      assignDeo: vi.fn(async () => ({ data: null, refreshed: false })),
      removeDeo: vi.fn(async () => ({ data: null, refreshed: false })),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Assign DEO')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Assign DEO'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'deo-2' } });
    fireEvent.click(within(drawer()).getAllByText('Assign DEO').at(-1)!);
    await waitFor(() =>
      expect(within(drawer()).getByText('Saved — this will appear once this device syncs.')).toBeInTheDocument(),
    );
    expect(within(drawer()).queryByText(/Failed to assign DEO/)).not.toBeInTheDocument();
  });

  it('shows the same note after a remove whose follow-up sync could not run', async () => {
    mockNemis({ removeDeo: vi.fn(async () => ({ data: null, refreshed: false })) });
    renderPage();
    await waitFor(() => expect(screen.getByText('Reassign DEO')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Reassign DEO'));
    fireEvent.click(screen.getByText('Remove from District'));
    await waitFor(() =>
      expect(within(drawer()).getByText('Saved — this will appear once this device syncs.')).toBeInTheDocument(),
    );
  });

  it('offline disables every DEO action', async () => {
    const nemis = mockNemis();
    renderPage(false);
    await waitFor(() => expect(screen.getByText('Reassign DEO')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Reassign DEO'));
    const panel = drawer();
    expect(within(panel).getByText('DEO changes need an internet connection.')).toBeInTheDocument();
    expect(within(panel).getByText('Remove from District').closest('button')).toBeDisabled();
    expect(within(panel).getAllByText('Reassign DEO').at(-1)!.closest('button')).toBeDisabled();
    expect(nemis.county.assignDeo).not.toHaveBeenCalled();
  });
});
