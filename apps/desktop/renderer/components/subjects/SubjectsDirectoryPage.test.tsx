import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { SubjectsDirectoryPage, validateDraftRows } from './SubjectsDirectoryPage';
import { clearNemis, renderWithLayer, stubNemis } from '../academic-grading/setup-test-support';

const subjectRow = (over: Record<string, unknown> = {}) => ({
  id: 's1', name: 'Mathematics', code: 'MATH', isActive: true, classCount: 0, ...over,
});

/** stubNemis() covers bootstrap; the page itself only talks to window.nemis.subject. */
function stubSubjects(existing: unknown[] = []) {
  stubNemis();
  const subject = {
    list: vi.fn(async () => ({ items: existing, total: existing.length, limit: 100, offset: 0 })),
    create: vi.fn(async (req: { name: string; code: string }) =>
      subjectRow({ id: `new-${req.code}`, name: req.name, code: req.code.trim().toUpperCase() })),
    update: vi.fn(async (req: { id: string; name: string; code: string }) => subjectRow(req)),
    setActive: vi.fn(),
  };
  (window as unknown as { nemis: Record<string, unknown> }).nemis.subject = subject;
  return subject;
}

const drawerTitle = (name: string) => screen.queryByRole('heading', { level: 2, name });

async function openCreate() {
  await renderWithLayer(<SubjectsDirectoryPage />);
  fireEvent.click(screen.getByRole('button', { name: 'New Subject' }));
  await waitFor(() => expect(drawerTitle('New Subjects')).not.toBeNull());
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fillRow = (row: number, name: string, code: string) => {
  type(`Subject Name (row ${row})`, name);
  type(`Subject Code (row ${row})`, code);
};
const addRow = () => fireEvent.click(screen.getByRole('button', { name: 'Add another subject' }));

afterEach(() => {
  clearNemis();
  vi.restoreAllMocks();
});

describe('validateDraftRows', () => {
  const row = (key: string, name: string, code: string, description = '') => ({ key, name, code, description });
  it('skips fully blank rows', () => expect(validateDraftRows([row('a', '', '', '')]).size).toBe(0));
  it('requires name and code on a started row', () =>
    expect(validateDraftRows([row('a', '', '', 'notes')]).get('a')).toBe('Name and code are required'));
  it('flags every repeat of a code after the first, ignoring case and spaces', () => {
    const errors = validateDraftRows([row('a', 'A', 'MATH'), row('b', 'B', ' math '), row('c', 'C', 'Math')]);
    expect([...errors]).toEqual([['b', 'Duplicate code in this batch'], ['c', 'Duplicate code in this batch']]);
  });
});

describe('SubjectsDirectoryPage — create several subjects', () => {
  it('creates every row in order and closes the drawer', async () => {
    const subject = stubSubjects();
    await openCreate();
    fillRow(1, 'Mathematics', 'MATH');
    addRow();
    fillRow(2, 'English', 'ENG');
    fireEvent.click(screen.getByRole('button', { name: 'Create 2 subjects' }));
    await waitFor(() => expect(subject.create).toHaveBeenCalledTimes(2));
    expect(subject.create.mock.calls.map(([req]) => req.code)).toEqual(['MATH', 'ENG']);
    await waitFor(() => expect(drawerTitle('New Subjects')).toBeNull());
  });

  it('blocks a code repeated in the batch', async () => {
    const subject = stubSubjects();
    await openCreate();
    fillRow(1, 'Mathematics', 'MATH');
    addRow();
    fillRow(2, 'Maths', ' math ');
    fireEvent.click(screen.getByRole('button', { name: 'Create 2 subjects' }));
    expect(await screen.findByText('Duplicate code in this batch')).toBeInTheDocument();
    expect(subject.create).not.toHaveBeenCalled();
  });

  it('blocks a row with a name but no code', async () => {
    const subject = stubSubjects();
    await openCreate();
    type('Subject Name (row 1)', 'Mathematics');
    fireEvent.click(screen.getByRole('button', { name: 'Create subject' }));
    expect(await screen.findByText('Name and code are required')).toBeInTheDocument();
    expect(subject.create).not.toHaveBeenCalled();
  });

  it('does not show errors on a fresh empty row before the first submit', async () => {
    stubSubjects();
    await openCreate();
    addRow();
    expect(screen.queryByText('Name and code are required')).toBeNull();
  });

  it('keeps only the row whose code already exists, with its message', async () => {
    const subject = stubSubjects([subjectRow()]);
    await openCreate();
    fillRow(1, 'English', 'ENG');
    addRow();
    fillRow(2, 'Maths', 'math');
    fireEvent.click(screen.getByRole('button', { name: 'Create 2 subjects' }));
    expect(await screen.findByText('A subject with code "MATH" already exists.')).toBeInTheDocument();
    expect(subject.create).toHaveBeenCalledTimes(1);
    expect(screen.queryByDisplayValue('English')).toBeNull();
    expect(screen.getByDisplayValue('Maths')).toBeInTheDocument();
    expect(drawerTitle('New Subjects')).not.toBeNull();
  });

  it('clears a row\'s save error when the row is edited', async () => {
    stubSubjects([subjectRow()]);
    await openCreate();
    fillRow(1, 'Maths', 'MATH');
    fireEvent.click(screen.getByRole('button', { name: 'Create subject' }));
    expect(await screen.findByText('A subject with code "MATH" already exists.')).toBeInTheDocument();
    type('Subject Code (row 1)', 'MATH2');
    expect(screen.queryByText('A subject with code "MATH" already exists.')).toBeNull();
  });

  it('ignores a blank extra row', async () => {
    const subject = stubSubjects();
    await openCreate();
    fillRow(1, 'Mathematics', 'MATH');
    addRow();
    fireEvent.click(screen.getByRole('button', { name: 'Create subject' }));
    await waitFor(() => expect(subject.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(drawerTitle('New Subjects')).toBeNull());
  });

  it('reopening the drawer starts with one empty row', async () => {
    stubSubjects([subjectRow()]);
    await openCreate();
    fillRow(1, 'Maths', 'MATH');
    addRow();
    fireEvent.click(screen.getByRole('button', { name: 'Create subject' }));
    expect(await screen.findByText('A subject with code "MATH" already exists.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(drawerTitle('New Subjects')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'New Subject' }));
    await waitFor(() => expect(drawerTitle('New Subjects')).not.toBeNull());
    expect(screen.getByLabelText('Subject Name (row 1)')).toHaveValue('');
    expect(screen.queryByLabelText('Subject Name (row 2)')).toBeNull();
    expect(screen.queryByText('A subject with code "MATH" already exists.')).toBeNull();
  });

  it('edit mode still edits one subject', async () => {
    const subject = stubSubjects([subjectRow()]);
    await renderWithLayer(<SubjectsDirectoryPage />);
    fireEvent.click(await screen.findByTitle('Edit subject'));
    await waitFor(() => expect(drawerTitle('Edit Subject')).not.toBeNull());
    expect(screen.getByDisplayValue('Mathematics')).toBeInTheDocument();
    expect(screen.getByDisplayValue('MATH')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add another subject' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(subject.update).toHaveBeenCalledTimes(1));
    expect(subject.create).not.toHaveBeenCalled();
  });
});
