import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { mockSearch } from '@/test-utils/search-params';
import { Navigator } from '@/test-utils/navigator';
import Page from './page';

vi.mock('next/navigation', async () => (await import('@/test-utils/search-params')).navigationMock);

const assignmentRow = (id: string, title: string) => ({
  id, classId: 'class-1', className: 'Grade 10A', teacherId: 'user-1', title, type: 'HOMEWORK', status: 'ACTIVE',
  dueDate: '2026-09-01', totalMarks: 100, submittedCount: 1, totalStudents: 1,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});
const submissionRow = (assignmentId: string, studentId: string, studentName: string) => ({
  id: `sub-${assignmentId}-${studentId}`, assignmentId, studentId, studentName, nemisId: '482915736045',
  status: 'SUBMITTED', submittedAt: '2026-08-01T00:00:00.000Z',
});

type Nemis = { assignment: { get: ReturnType<typeof vi.fn>; listSubmissions: ReturnType<typeof vi.fn> } };
const nemis = () => (window as unknown as { nemis: Nemis }).nemis;
const wrap = (ui: React.ReactNode) => <PresentationProvider layer={createRendererPresentation()}>{ui}</PresentationProvider>;

beforeEach(() => {
  window.history.pushState({}, '', '/government/teacher/assignment/submission?assignmentId=a-1&studentId=s-1');
  mockSearch('assignmentId=a-1&studentId=s-1');
  (window as unknown as { nemis: unknown }).nemis = {
    identity: { getCurrentUser: vi.fn(async () => ({ id: 'user-1', fullName: 'Jane Doe', email: 'jane@example.com', isActive: true, roles: ['TEACHER'] })) },
    device: { getInfo: vi.fn(async () => null) },
    school: { getSummary: vi.fn(async () => null) },
    dashboard: { getOverview: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(async () => null) },
    term: { getCurrent: vi.fn(async () => null) },
    assignment: {
      get: vi.fn(async (id: string) => assignmentRow(id, id === 'a-2' ? 'Second Homework' : 'First Homework')),
      listSubmissions: vi.fn(async (assignmentId: string) => [
        submissionRow(assignmentId, 's-1', assignmentId === 'a-2' ? 'Beta Student' : 'Alpha Student'),
        submissionRow(assignmentId, 's-2', 'Other Student'),
      ]),
    },
  };
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  window.history.pushState({}, '', '/');
});

async function presentation() {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  return layer;
}

describe('Assignment submission route', () => {
  it("loads the assignment and student named by its own address, not the previous page's", async () => {
    window.history.pushState({}, '', '/government/teacher/assignment/submission?assignmentId=a-old&studentId=s-old');
    mockSearch('assignmentId=a-1&studentId=s-1');
    render(<PresentationProvider layer={await presentation()}><Page /></PresentationProvider>);
    expect(await screen.findByText('Alpha Student')).toBeInTheDocument();
    expect(nemis().assignment.get).toHaveBeenCalledWith('a-1');
    expect(nemis().assignment.listSubmissions).toHaveBeenCalledWith('a-1');
    expect(nemis().assignment.get).not.toHaveBeenCalledWith('a-old');
    expect(nemis().assignment.listSubmissions).not.toHaveBeenCalledWith('a-old');
  });

  it('follows a changed assignment: shows the new assignment and student, and none of the old', async () => {
    const layer = await presentation();
    render(
      <PresentationProvider layer={layer}>
        <Navigator to="assignmentId=a-2&studentId=s-1" page={() => <Page />} />
      </PresentationProvider>,
    );
    expect(await screen.findByText('Alpha Student')).toBeInTheDocument();
    expect(screen.getByText('First Homework')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('Beta Student')).toBeInTheDocument();
    expect(screen.getByText('Second Homework')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Student')).toBeNull();
    expect(screen.queryByText('First Homework')).toBeNull();
  });

  it('follows a changed student on the same assignment', async () => {
    const layer = await presentation();
    render(
      <PresentationProvider layer={layer}>
        <Navigator to="assignmentId=a-1&studentId=s-2" page={() => <Page />} />
      </PresentationProvider>,
    );
    expect(await screen.findByText('Alpha Student')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('Other Student')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Student')).toBeNull();
  });

  it('makes no call when either id is missing (and does when both are present)', async () => {
    // Positive control: with the current user bootstrapped, both ids present => calls happen.
    const layer = await presentation();
    const control = render(<PresentationProvider layer={layer}><Page /></PresentationProvider>);
    await waitFor(() => expect(nemis().assignment.get).toHaveBeenCalledWith('a-1'));
    expect(nemis().assignment.listSubmissions).toHaveBeenCalledWith('a-1');
    control.unmount();
    nemis().assignment.get.mockClear();
    nemis().assignment.listSubmissions.mockClear();

    for (const query of ['assignmentId=a-1', 'studentId=s-1', '']) {
      mockSearch(query);
      const view = render(<PresentationProvider layer={layer}><Page /></PresentationProvider>);
      await new Promise((r) => setTimeout(r, 50));
      expect(nemis().assignment.get).not.toHaveBeenCalled();
      expect(nemis().assignment.listSubmissions).not.toHaveBeenCalled();
      view.unmount();
    }
  });
});
