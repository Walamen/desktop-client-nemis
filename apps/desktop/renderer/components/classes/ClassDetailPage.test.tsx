import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { mockSearch } from '@/test-utils/search-params';
import { Navigator } from '@/test-utils/navigator';
import { ClassDetailPage } from './ClassDetailPage';

vi.mock('next/navigation', async () => (await import('@/test-utils/search-params')).navigationMock);

const cls = (id: string, name: string) => ({
  id, academicYearId: 'ay-1', name, gradeLevel: 'GRADE_1', isActive: true, subjectCount: 1,
});
const student = (id: string, fullName: string) => ({
  id, fullName, firstName: fullName, lastName: 'X', nemisId: null, gender: 'FEMALE', isActive: true,
});

type Nemis = {
  classes: { list: ReturnType<typeof vi.fn>; listSubjects: ReturnType<typeof vi.fn> };
  student: { list: ReturnType<typeof vi.fn> };
  teacher: { list: ReturnType<typeof vi.fn>; listAssignments: ReturnType<typeof vi.fn> };
};
const nemis = () => (window as unknown as { nemis: Nemis }).nemis;
const wrap = (ui: React.ReactNode) => <PresentationProvider layer={createRendererPresentation()}>{ui}</PresentationProvider>;

beforeEach(() => {
  mockSearch('id=class-1');
  window.history.pushState({}, '', '/government/school-admin/classes/detail?id=class-1');
  (window as unknown as { nemis: unknown }).nemis = {
    classes: {
      list: vi.fn(async () => ({ items: [cls('class-1', 'Alpha Class'), cls('class-2', 'Beta Class')], total: 2, limit: 100, offset: 0 })),
      listSubjects: vi.fn(async (classId: string) => [
        { classId, subjectId: `sub-${classId}`, subjectName: classId === 'class-1' ? 'Alpha Maths' : 'Beta Maths', subjectCode: 'M', assignedAt: '2026-01-01T00:00:00.000Z' },
      ]),
    },
    subject: { list: vi.fn(async () => ({ items: [], total: 0, limit: 25, offset: 0 })) },
    student: {
      list: vi.fn(async (r: { classId: string }) => ({
        items: [r.classId === 'class-1' ? student('s1', 'Alpha Pupil') : student('s2', 'Beta Pupil')], total: 1, limit: 100, offset: 0,
      })),
    },
    teacher: {
      list: vi.fn(async () => ({ items: [], total: 0, limit: 100, offset: 0 })),
      listAssignments: vi.fn(async () => []),
    },
  };
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  window.history.pushState({}, '', '/');
});

describe('ClassDetailPage own address', () => {
  it("loads the class named by its own address, not the previous page's", async () => {
    window.history.pushState({}, '', '/government/school-admin/classes?id=stale');
    mockSearch('id=class-2');
    render(wrap(<ClassDetailPage />));
    expect(await screen.findByText('Beta Class')).toBeInTheDocument();
    await waitFor(() => expect(nemis().student.list).toHaveBeenCalledWith(expect.objectContaining({ classId: 'class-2' })));
    expect(nemis().student.list).not.toHaveBeenCalledWith(expect.objectContaining({ classId: 'stale' }));
    expect(nemis().classes.listSubjects).not.toHaveBeenCalledWith('stale');
    expect(screen.queryByText('Alpha Class')).toBeNull();
  });

  it('follows a changed id: shows the new class, its students and subjects, and none of the old', async () => {
    render(wrap(<Navigator to="id=class-2" page={() => <ClassDetailPage />} />));
    expect(await screen.findByText('Alpha Class')).toBeInTheDocument();
    expect(await screen.findByText('Alpha Pupil')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Subjects & Teachers/ }));
    expect(await screen.findByText('Alpha Maths')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('Beta Class')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Class')).toBeNull();
    expect(screen.queryByText('Alpha Maths')).toBeNull();
    expect(await screen.findByText('Beta Pupil')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Pupil')).toBeNull();
  });

  it('does not show the previous class subjects while the new class subjects load', async () => {
    let release: (rows: unknown[]) => void = () => undefined;
    nemis().classes.listSubjects.mockImplementation((classId: string) =>
      classId === 'class-1'
        ? Promise.resolve([{ classId, subjectId: 's-a', subjectName: 'Alpha Maths', subjectCode: 'M', assignedAt: '2026-01-01T00:00:00.000Z' }])
        : new Promise((r) => { release = r; }),
    );
    render(wrap(<Navigator to="id=class-2" page={() => <ClassDetailPage />} />));
    fireEvent.click(await screen.findByRole('button', { name: /Subjects & Teachers/ }));
    expect(await screen.findByText('Alpha Maths')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('Beta Class')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Subjects & Teachers/ }));
    expect(screen.queryByText('Alpha Maths')).toBeNull();
    release([{ classId: 'class-2', subjectId: 's-b', subjectName: 'Beta Maths', subjectCode: 'M', assignedAt: '2026-01-01T00:00:00.000Z' }]);
    expect(await screen.findByText('Beta Maths')).toBeInTheDocument();
  });

  it('makes no class call without an id', async () => {
    window.history.pushState({}, '', '/government/school-admin/classes/detail');
    mockSearch('');
    render(wrap(<ClassDetailPage />));
    await new Promise((r) => setTimeout(r, 50));
    expect(nemis().classes.list).not.toHaveBeenCalled();
    expect(nemis().classes.listSubjects).not.toHaveBeenCalled();
    expect(nemis().student.list).not.toHaveBeenCalled();
  });
});
