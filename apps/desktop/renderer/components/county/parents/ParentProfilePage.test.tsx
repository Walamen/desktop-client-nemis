import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { ParentProfilePage } from './ParentProfilePage';

let searchId: string | null = 'g-1';
const push = vi.fn();
const back = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => searchId }),
  useRouter: () => ({ push, back }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const child = (id: string, extra: Record<string, unknown> = {}) => ({
  id, firstName: 'Ada', lastName: 'Kollie', nemisId: '482915736045', photoUrl: null, isActive: true,
  isPrimary: false, institution: { id: 'sch-a', name: 'Alpha School', districtName: 'Buchanan' }, ...extra,
});

const DETAIL = {
  id: 'g-1', firstName: 'Mary', lastName: 'Kollie', relationship: 'Mother', phoneNumber: '0770111222',
  email: 'mary@x.lr', address: null, occupation: 'Trader', isEmergencyContact: true, photoUrl: null,
  studentsCount: 2, districts: ['Buchanan', 'Owensgrove'], messageInstitutionId: 'sch-a',
  children: [
    child('s-1', { isPrimary: true }),
    child('s-2', { firstName: 'Ben', isActive: false, institution: { id: 'sch-b', name: 'Beta School', districtName: 'Owensgrove' } }),
  ],
};

function renderWith(detail: Record<string, unknown> | null = DETAIL) {
  const getGuardian = vi.fn(async () => detail);
  (window as unknown as { nemis: unknown }).nemis = { county: { getGuardian } };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <ParentProfilePage />
    </PresentationProvider>,
  );
  return getGuardian;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  searchId = 'g-1';
  push.mockClear();
  back.mockClear();
});

describe('County parent profile page', () => {
  it('shows the hero, contact rows and children count', async () => {
    const getGuardian = renderWith();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Mary Kollie' })).toBeInTheDocument());
    expect(getGuardian).toHaveBeenCalledWith('g-1');
    expect(screen.getByText('Buchanan · Owensgrove')).toBeInTheDocument();
    expect(screen.getByText('Children', { selector: 'p' }).parentElement!.textContent).toContain('2');
    expect(screen.getByText('0770111222')).toBeInTheDocument();
    expect(screen.getByText('mary@x.lr')).toBeInTheDocument();
    expect(screen.getByText('Buchanan, Owensgrove')).toBeInTheDocument();
    expect(screen.getByText('Trader')).toBeInTheDocument();
    expect(screen.getByText('2 students')).toBeInTheDocument();
  });

  it('engagement: High with email and emergency contact', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('High Engagement')).toBeInTheDocument());
    expect(screen.getByText('Has email and is an emergency contact')).toBeInTheDocument();
    expect(screen.getByText('Designated emergency contact')).toBeInTheDocument();
  });

  it('engagement: Medium with email only', async () => {
    renderWith({ ...DETAIL, isEmergencyContact: false });
    await waitFor(() => expect(screen.getByText('Medium Engagement')).toBeInTheDocument());
    expect(screen.queryByText('Designated emergency contact')).not.toBeInTheDocument();
  });

  it('engagement: Low with neither; the email row reads Not provided', async () => {
    renderWith({ ...DETAIL, isEmergencyContact: false, email: null });
    await waitFor(() => expect(screen.getByText('Low Engagement')).toBeInTheDocument());
    expect(screen.getByText('Phone only — consider collecting email')).toBeInTheDocument();
    expect(screen.getByText('Not provided')).toBeInTheDocument();
  });

  it('child cards show the NEMIS ID, real status, Primary, and link to the student profile', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Children (2)')).toBeInTheDocument());
    expect(screen.getAllByText('4829-1573-6045')).toHaveLength(2);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Ada Kollie').closest('a')).toHaveAttribute('href', '/government/county/students/details?id=s-1');
  });

  it('Send Message opens Messages for the school, never a mailto link', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByRole('button', { name: /Send Message/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Send Message/ }));
    expect(push).toHaveBeenCalledWith('/government/county/messages?institutionId=sch-a');
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it('Send Message is disabled without a school to use', async () => {
    renderWith({ ...DETAIL, messageInstitutionId: null });
    await waitFor(() => expect(screen.getByRole('button', { name: /Send Message/ })).toBeDisabled());
    expect(screen.getByRole('button', { name: /Send Message/ })).toHaveAttribute('title', 'No linked school');
  });

  it('shows Guardian not found for an unknown guardian, and Go back returns', async () => {
    renderWith(null);
    await waitFor(() => expect(screen.getByText('Guardian not found')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(back).toHaveBeenCalled();
  });

  it('shows Guardian not found without an id, without loading', async () => {
    searchId = null;
    const getGuardian = renderWith();
    await waitFor(() => expect(screen.getByText('Guardian not found')).toBeInTheDocument());
    expect(getGuardian).not.toHaveBeenCalled();
  });
});
