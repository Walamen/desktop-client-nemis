import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DeoSchoolDetail, DeoSchoolDetailResult } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DeoSchoolDetailRoute from './page';

const back = vi.fn();
let currentSearch = 'id=s-1';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

function school(overrides: Partial<DeoSchoolDetail> = {}): DeoSchoolDetail {
  return {
    id: 's-1',
    name: 'Alpha Academy',
    code: 'ALP',
    levels: ['PRIMARY'],
    address: '12 Broad St, Sinkor',
    establishedYear: 1998,
    principalName: 'Ann First',
    students: 4,
    teachers: 2,
    attendanceRate: 88,
    lastSubmissionAt: null,
    performanceStatus: 'Good',
    academic: { totalGrades: 2, averageScore: 75 },
    feeCollectionRate: 60,
    gender: { male: 2, female: 1 },
    enrollmentByGrade: [
      { gradeLevel: 'GRADE_2', students: 3 },
      { gradeLevel: null, students: 1 },
    ],
    reportMonths: [true, false, true],
    complianceStatus: 'Needs Review',
    ...overrides,
  } as DeoSchoolDetail;
}

function result(s: DeoSchoolDetail | null, districtId: string | null = 'd-1'): DeoSchoolDetailResult {
  return { districtId, school: s };
}

function mockNemis(getSchool: (id: string) => Promise<DeoSchoolDetailResult>) {
  const nemis = { deo: { getSchool: vi.fn(getSchool) } };
  (window as unknown as { nemis: unknown }).nemis = nemis;
  return nemis;
}

function tree() {
  return (
    <PresentationProvider layer={layer}>
      <DeoSchoolDetailRoute />
    </PresentationProvider>
  );
}

let layer: ReturnType<typeof createRendererPresentation>;
function renderPage() {
  layer = createRendererPresentation();
  return render(tree());
}

beforeEach(() => {
  currentSearch = 'id=s-1';
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  back.mockReset();
});

describe('DEO School detail page', () => {
  it('shows the real figures', async () => {
    mockNemis(async () => result(school()));
    renderPage();
    expect(await screen.findByText('Primary · 12 Broad St, Sinkor · Est. 1998')).toBeInTheDocument();
    expect(screen.getByText('Principal: Ann First')).toBeInTheDocument();
    expect(screen.getAllByText('88%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('75%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('60%').length).toBeGreaterThan(0);
    expect(screen.getByText('Needs Review')).toHaveClass('bg-amber-900', 'text-amber-300');
    const g2 = screen.getByText('Grade 2');
    const none = screen.getByText('Grade not set');
    expect(g2.compareDocumentPosition(none) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/months with a submitted report/)).not.toBeInTheDocument();
    expect(screen.queryByText('Reports')).not.toBeInTheDocument();
    expect(screen.getByText('Fee Compliance')).toBeInTheDocument();
    expect(screen.getByText('Gender Distribution')).toBeInTheDocument();
    expect(screen.queryByText(/All required reports submitted/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Schools' }));
    expect(back).toHaveBeenCalled();
  });

  it('says No data instead of zeros', async () => {
    mockNemis(async () =>
      result(
        school({
          attendanceRate: null,
          academic: { totalGrades: 0, averageScore: null },
          feeCollectionRate: null,
          principalName: null,
          establishedYear: null,
          address: null,
        }),
      ),
    );
    renderPage();
    expect(await screen.findByText('Principal: Not recorded')).toBeInTheDocument();
    expect(screen.getAllByText('No data').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('No fees billed this year')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.queryByText(/Est\./)).not.toBeInTheDocument();
  });

  it('handles zero students without NaN', async () => {
    mockNemis(async () =>
      result(school({ students: 0, gender: { male: 0, female: 0 }, enrollmentByGrade: [] })),
    );
    const { container } = renderPage();
    expect(await screen.findByText('No enrollment data available')).toBeInTheDocument();
    expect(screen.getByText('Gender Distribution').parentElement?.textContent).toContain('No data');
    expect(container.innerHTML).not.toContain('NaN');
  });

  it('shows not found when the school is not in the district', async () => {
    mockNemis(async () => result(null));
    renderPage();
    expect(await screen.findByText('School not found in your district.')).toBeInTheDocument();
  });

  it('shows the no-district message', async () => {
    mockNemis(async () => result(null, null));
    renderPage();
    expect(await screen.findByText('No district is assigned to your account.')).toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    let calls = 0;
    mockNemis(async () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return result(school());
    });
    renderPage();
    expect(await screen.findByText('Could not load this school.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Principal: Ann First')).toBeInTheDocument();
  });

  it('shows no stale school when the id changes', async () => {
    mockNemis((id) =>
      id === 's-1' ? Promise.resolve(result(school())) : new Promise<DeoSchoolDetailResult>(() => {}),
    );
    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getAllByText('Alpha Academy').length).toBeGreaterThan(0));
    currentSearch = 'id=s-2';
    rerender(tree());
    expect(screen.queryByText('Alpha Academy')).not.toBeInTheDocument();
    expect(screen.queryByText('School not found in your district.')).not.toBeInTheDocument();
    expect(screen.getByText('Loading school…')).toBeInTheDocument();
  });
});
