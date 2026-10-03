import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GradeLevel } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { ClassTermPicker, isClassTermComplete, type ClassTermValue } from './ClassTermPicker';

const currentYear = {
  id: 'y1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31',
  isCurrent: true, status: 'ACTIVE', termCount: 1, classCount: 1,
};
const pastYear = { ...currentYear, id: 'y0', code: '2024/2025', isCurrent: false, status: 'CLOSED' };
const term1 = {
  id: 't1', academicYearId: 'y1', name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-15', isCurrent: true,
};
const jss1a = {
  id: 'c1', academicYearId: 'y1', name: 'JSS1-A', gradeLevel: 'GRADE_7', isActive: true, subjectCount: 0,
};

interface Stubs {
  years?: () => Promise<unknown>;
  terms?: (academicYearId: string) => Promise<unknown>;
  classes?: (request: unknown) => Promise<unknown>;
}

function stubNemis(stubs: Stubs) {
  const yearsList = vi.fn(stubs.years ?? (async () => [currentYear]));
  const termsList = vi.fn(stubs.terms ?? (async () => [term1]));
  const classesList = vi.fn(stubs.classes ?? (async () => ({ items: [jss1a], total: 1 })));
  (window as unknown as { nemis: unknown }).nemis = {
    school: { getSummary: vi.fn(async () => ({ id: 'inst-1', code: 'S1', name: 'Test School', type: 'PUBLIC', ownership: 'GOVERNMENT', approvalStatus: 'APPROVED', isApproved: true })) },
    academicYear: { getCurrent: vi.fn(async () => null), list: yearsList },
    term: { getCurrent: vi.fn(async () => null), list: termsList },
    classes: { list: classesList },
  };
  return { yearsList, termsList, classesList };
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

const EMPTY: ClassTermValue = { academicYearId: '', classId: '', termId: '' };

/** A parent that owns the value, as the wizard will — so the year-sync
 * effect sees its own update and a loop would show up as repeated calls. */
function Harness({ gradeLevel, onChange }: { gradeLevel: GradeLevel | ''; onChange: (v: ClassTermValue) => void }) {
  const [value, setValue] = useState<ClassTermValue>(EMPTY);
  return (
    <ClassTermPicker
      gradeLevel={gradeLevel}
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

async function renderPicker(gradeLevel: GradeLevel | '' = 'GRADE_7') {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  const onChange = vi.fn();
  const utils = render(
    <PresentationProvider layer={layer}>
      <Harness gradeLevel={gradeLevel} onChange={onChange} />
    </PresentationProvider>,
  );
  return { onChange, ...utils };
}

// The shared Select doesn't associate its <label> with the <select>, so find
// the label by text and walk to the sibling element (as StudentFormPage.test does).
function selectNear(labelPattern: RegExp): HTMLSelectElement {
  const label = Array.from(document.querySelectorAll('label')).find((l) =>
    labelPattern.test(l.textContent ?? ''),
  );
  const select = label?.parentElement?.querySelector('select');
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error(`Expected a <select> near label matching ${labelPattern}`);
  }
  return select;
}

const EMPTY_HINT = 'No classes for GRADE 7 — create one first.';

describe('ClassTermPicker', () => {
  it('lists only the current year classes of the chosen grade, then terms', async () => {
    const { classesList, termsList } = stubNemis({});
    const user = userEvent.setup();
    const { onChange } = await renderPicker('GRADE_7');

    expect(await screen.findByRole('option', { name: 'JSS1-A' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Term 1' })).toBeInTheDocument();
    expect(screen.getByText('Academic year: 2025/2026')).toBeInTheDocument();
    expect(classesList).toHaveBeenCalledWith(
      expect.objectContaining({ academicYearId: 'y1', gradeLevel: 'GRADE_7' }),
    );
    expect(termsList).toHaveBeenCalledWith('y1');

    // The year-sync effect reports the current year exactly once — no loop.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ academicYearId: 'y1', classId: '', termId: '' }));
    expect(onChange).toHaveBeenCalledTimes(1);

    await user.selectOptions(selectNear(/^class/i), 'c1');
    await user.selectOptions(selectNear(/^term/i), 't1');
    expect(onChange).toHaveBeenLastCalledWith({ academicYearId: 'y1', classId: 'c1', termId: 't1' });
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(isClassTermComplete({ academicYearId: 'y1', classId: 'c1', termId: 't1' })).toBe(true);
  });

  it('drops classes of another grade, year, or inactive ones the list returned', async () => {
    stubNemis({
      classes: async () => ({
        items: [
          jss1a,
          { ...jss1a, id: 'c2', name: 'JSS2-A', gradeLevel: 'GRADE_8' },
          { ...jss1a, id: 'c3', name: 'Old JSS1', academicYearId: 'y0' },
          { ...jss1a, id: 'c4', name: 'Closed JSS1', isActive: false },
        ],
        total: 4,
      }),
    });
    await renderPicker('GRADE_7');
    expect(await screen.findByRole('option', { name: 'JSS1-A' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'JSS2-A' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Old JSS1' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Closed JSS1' })).toBeNull();
  });

  it('empty-state only when empty: no hint while loading, a hint once classes load empty', async () => {
    stubNemis({ classes: () => new Promise(() => {}) });
    const first = await renderPicker('GRADE_7');
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Loading…' }).length).toBeGreaterThan(0));
    expect(await screen.findByRole('option', { name: 'Term 1' })).toBeInTheDocument();
    expect(screen.queryByText(/No classes for/)).toBeNull();
    first.unmount();

    stubNemis({ classes: async () => ({ items: [], total: 0 }) });
    await renderPicker('GRADE_7');
    expect(await screen.findByText(EMPTY_HINT)).toBeInTheDocument();
  });

  it('shows a retry, not the empty hint, when loading classes fails', async () => {
    let fail = true;
    const { classesList } = stubNemis({
      classes: async () => {
        if (fail) throw new Error('boom');
        return { items: [jss1a], total: 1 };
      },
    });
    const user = userEvent.setup();
    await renderPicker('GRADE_7');

    expect(await screen.findByText(/Couldn't load classes\./)).toBeInTheDocument();
    expect(screen.queryByText(/No classes for/)).toBeNull();

    fail = false;
    const calls = classesList.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('option', { name: 'JSS1-A' })).toBeInTheDocument();
    expect(classesList.mock.calls.length).toBe(calls + 1);
  });

  it('no current year: says so and reports incomplete', async () => {
    const { classesList, termsList } = stubNemis({ years: async () => [pastYear] });
    const { onChange } = await renderPicker('GRADE_7');

    expect(
      await screen.findByText(
        'There is no current academic year on this device. Set one under Academic Years before enrolling.',
      ),
    ).toBeInTheDocument();
    for (const [value] of onChange.mock.calls as [ClassTermValue][]) {
      expect(value.academicYearId).toBe('');
    }
    expect(classesList).not.toHaveBeenCalled();
    expect(termsList).not.toHaveBeenCalled();
    expect(isClassTermComplete(EMPTY)).toBe(false);
  });

  it('restores the shared class filters it found when it unmounts', async () => {
    const { classesList } = stubNemis({});
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    const foundation = layer.viewModels.academicFoundation;
    foundation.setClassFilters({ keyword: 'x' });
    const snapshot = foundation.store.getState().classFilters;

    const view = render(
      <PresentationProvider layer={layer}>
        <Harness gradeLevel="GRADE_7" onChange={vi.fn()} />
      </PresentationProvider>,
    );
    expect(await screen.findByRole('option', { name: 'JSS1-A' })).toBeInTheDocument();
    expect(foundation.store.getState().classFilters).toEqual({ academicYearId: 'y1', gradeLevel: 'GRADE_7' });
    const callsBeforeUnmount = classesList.mock.calls.length;

    view.unmount();
    expect(foundation.store.getState().classFilters).toBe(snapshot);
    // No reload on unmount — the next page loads its own classes.
    expect(classesList.mock.calls.length).toBe(callsBeforeUnmount);
  });

  it('asks for a grade before showing classes', async () => {
    const { classesList } = stubNemis({});
    await renderPicker('');
    expect(await screen.findByText('Choose a grade to see its classes.')).toBeInTheDocument();
    expect(classesList).not.toHaveBeenCalled();
  });

  it("no empty hint while classes reload over another grade's stale list", async () => {
    // The foundation store is shared app-wide: another page left GRADE_8
    // classes in it. While this picker's GRADE_7 load is in flight the status
    // is 'refreshing' with that stale list, which filters to nothing.
    let calls = 0;
    stubNemis({
      classes: () => {
        calls += 1;
        if (calls === 1) {
          return Promise.resolve({ items: [{ ...jss1a, id: 'c8', name: 'JSS2-A', gradeLevel: 'GRADE_8' }], total: 1 });
        }
        return new Promise(() => {});
      },
    });
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    const foundation = layer.viewModels.academicFoundation;
    await foundation.loadClasses();
    expect(foundation.store.getState().classes.status).toBe('success');

    render(
      <PresentationProvider layer={layer}>
        <Harness gradeLevel="GRADE_7" onChange={vi.fn()} />
      </PresentationProvider>,
    );
    await waitFor(() => expect(foundation.store.getState().classes.status).toBe('refreshing'));
    expect(await screen.findByRole('option', { name: 'Term 1' })).toBeInTheDocument();
    expect(screen.queryByText(/No classes for/)).toBeNull();
    expect(selectNear(/^class/i).querySelector('option')?.textContent).toBe('Loading…');
  });

  it("never lists another year's terms while the current year's terms reload", async () => {
    const oldTerm = { ...term1, id: 't0', academicYearId: 'y0', name: 'Old Term' };
    stubNemis({
      years: async () => [currentYear, pastYear],
      terms: (academicYearId) => (academicYearId === 'y0' ? Promise.resolve([oldTerm]) : new Promise(() => {})),
    });
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    const foundation = layer.viewModels.academicFoundation;
    await foundation.loadTerms('y0');
    expect(foundation.store.getState().terms.status).toBe('success');

    render(
      <PresentationProvider layer={layer}>
        <Harness gradeLevel="GRADE_7" onChange={vi.fn()} />
      </PresentationProvider>,
    );
    expect(await screen.findByRole('option', { name: 'JSS1-A' })).toBeInTheDocument();
    await waitFor(() => expect(foundation.store.getState().terms.status).toBe('refreshing'));
    expect(screen.queryByRole('option', { name: 'Old Term' })).toBeNull();
    expect(selectNear(/^term/i).querySelector('option')?.textContent).toBe('Loading…');
  });
});
