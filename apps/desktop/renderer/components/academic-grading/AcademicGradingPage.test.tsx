import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })),
    saveSchoolAdminRecord: vi.fn(),
    deleteSchoolAdminRecord: vi.fn(),
  },
}));

import { AcademicGradingPage } from './AcademicGradingPage';
import { CURRENT_YEAR, clearNemis, field, renderWithLayer, stubNemis } from './setup-test-support';

const drawerHeading = (name: string) => screen.findByRole('heading', { level: 2, name });

afterEach(() => {
  clearNemis();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('AcademicGradingPage', () => {
  it('shows the setup cards in dependency order', async () => {
    stubNemis();
    await renderWithLayer(<AcademicGradingPage />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Grading Configuration',
      'Academic Years',
      'Terms',
      'Assessment Periods',
      'Grade Entry Windows',
      'Grade Entry',
    ]);
  });

  it('puts the year and term steps into the quick start guide', async () => {
    stubNemis();
    await renderWithLayer(<AcademicGradingPage />);
    const order = ['Configure the Grading System', 'Create the Academic Year', 'Add Terms', 'Create Assessment Periods', 'Open Grade Entry Windows', 'Review and Publish'];
    const nodes = order.map((t) => screen.getByText(t));
    for (let i = 1; i < nodes.length; i += 1) {
      expect(nodes[i - 1]!.compareDocumentPosition(nodes[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it.each([
    ['Manage Years', 'Academic Years'],
    ['Manage Terms', 'Terms'],
    ['Manage Periods', 'Assessment Periods'],
    ['Manage Windows', 'Grade Entry Windows'],
  ])('%s opens the %s drawer', async (action, title) => {
    stubNemis({ currentYear: CURRENT_YEAR });
    await renderWithLayer(<AcademicGradingPage />);
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(await drawerHeading(title)).toBeInTheDocument();
  });

  it('opens the drawer named in ?open=, on the year named in ?yearId=', async () => {
    stubNemis();
    window.history.replaceState({}, '', '/?open=terms&yearId=y0');
    await renderWithLayer(<AcademicGradingPage />);
    expect(await drawerHeading('Terms')).toBeInTheDocument();
    await waitFor(() => expect(field('Academic year')).toHaveValue('y0'));
  });

  it('opens the Windows drawer from ?open=windows', async () => {
    stubNemis();
    window.history.replaceState({}, '', '/?open=windows');
    await renderWithLayer(<AcademicGradingPage />);
    expect(await drawerHeading('Grade Entry Windows')).toBeInTheDocument();
  });

  it('opens a drawer when ?open= changes while the page is already showing (sidebar click)', async () => {
    stubNemis();
    function Harness() {
      const [, setTick] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setTick((n) => n + 1)}>simulate navigation</button>
          <AcademicGradingPage />
        </>
      );
    }
    await renderWithLayer(<Harness />);
    expect(screen.queryByRole('heading', { level: 2, name: 'Grade Entry Windows' })).toBeNull();
    window.history.pushState({}, '', '/?open=windows');
    fireEvent.click(screen.getByRole('button', { name: 'simulate navigation' }));
    expect(await drawerHeading('Grade Entry Windows')).toBeInTheDocument();
  });

  it('drops the query when switching drawers in-page, so the same deep link works again', async () => {
    stubNemis();
    window.history.replaceState({}, '', '/?open=years');
    await renderWithLayer(<AcademicGradingPage />);
    await drawerHeading('Academic Years');
    const replace = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(await screen.findByRole('button', { name: '3 terms in 2024/2025' }));
    expect(await drawerHeading('Terms')).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith(null, '', '/');
  });

  it.each(['setup', 'bogus', ''])('opens nothing for ?open=%s', async (value) => {
    stubNemis();
    window.history.replaceState({}, '', `/?open=${value}`);
    await renderWithLayer(<AcademicGradingPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Academic Grading' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close drawer' })).toBeNull();
  });

  it('drops the query string when the drawer closes, so it does not reopen', async () => {
    stubNemis();
    window.history.replaceState({}, '', '/?open=years');
    await renderWithLayer(<AcademicGradingPage />);
    await drawerHeading('Academic Years');
    const replace = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(replace).toHaveBeenCalledWith(null, '', '/');
  });

  it('follows a year\'s term count from the Years drawer into the Terms drawer', async () => {
    stubNemis();
    await renderWithLayer(<AcademicGradingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Manage Years' }));
    fireEvent.click(await screen.findByRole('button', { name: '3 terms in 2024/2025' }));
    expect(await drawerHeading('Terms')).toBeInTheDocument();
    await waitFor(() => expect(field('Academic year')).toHaveValue('y0'));
  });
});
