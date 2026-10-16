import { describe, expect, it } from 'vitest';
import { humanizeEntityType, pickEntityLabel } from './sync-labels';

describe('humanizeEntityType', () => {
  it('title-cases snake and upper case', () => {
    expect(humanizeEntityType('student_guardians')).toBe('Student Guardians');
    expect(humanizeEntityType('FEE_PAYMENT')).toBe('Fee Payment');
  });
});

describe('pickEntityLabel', () => {
  it('uses a name key from the edited record', () => {
    expect(pickEntityLabel({ record: { name: 'Grade 5A' } }, null, 'classes', 'c1')).toBe('Grade 5A');
  });
  it('joins first and last name', () => {
    expect(pickEntityLabel({ record: { firstName: 'Musu', lastName: 'Kollie' } }, null, 'students', 's1')).toBe('Musu Kollie');
  });
  it('falls back to the envelope base for a delete', () => {
    expect(pickEntityLabel({ base: { firstName: 'Ada', lastName: 'Lovelace' } }, null, 'students', 's1')).toBe('Ada Lovelace');
  });
  it('reads a bare (non-envelope) row', () => {
    expect(pickEntityLabel({ title: 'Essay 1' }, null, 'assignments', 'a1')).toBe('Essay 1');
  });
  it('falls back to type and a short id', () => {
    expect(pickEntityLabel(null, null, 'widgets', 'abcdef123456')).toBe('Widgets · abcdef12…');
  });
});
