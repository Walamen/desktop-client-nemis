import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import { isoDate, maxLength, required } from '../validators/form-validators';
import { FormManager } from './form-manager';

interface StudentFormValues extends Record<string, unknown> {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

const initial: StudentFormValues = { firstName: '', lastName: '', dateOfBirth: '' };

function build() {
  return new FormManager<StudentFormValues>(initial, [
    required('firstName', 'lastName'),
    maxLength('firstName', 50),
    isoDate('dateOfBirth'),
  ]);
}

describe('FormManager', () => {
  it('tracks values and dirtiness, clearing the edited field error', () => {
    const form = build();
    expect(form.store.getState().isDirty).toBe(false);
    form.validate();
    expect(form.store.getState().errors.firstName).toBe('This field is required.');
    form.setValue('firstName', 'Ada');
    const state = form.store.getState();
    expect(state.values.firstName).toBe('Ada');
    expect(state.isDirty).toBe(true);
    expect(state.errors.firstName).toBeUndefined();
    form.setValue('firstName', '');
    expect(form.store.getState().isDirty).toBe(false);
  });

  it('validate merges validators and reports validity', () => {
    const form = build();
    form.setValue('firstName', 'Ada');
    form.setValue('lastName', 'Lovelace');
    form.setValue('dateOfBirth', 'not-a-date');
    expect(form.validate()).toBe(false);
    expect(form.store.getState().errors.dateOfBirth).toBe('Enter a valid date.');
    form.setValue('dateOfBirth', '2015-06-01');
    expect(form.validate()).toBe(true);
  });

  it('isoDate rejects Date.parse-permissive non-ISO strings', () => {
    const form = build();
    form.setValue('firstName', 'Ada');
    form.setValue('lastName', 'Lovelace');
    form.setValue('dateOfBirth', '01/02/2020');
    expect(form.validate()).toBe(false);
    expect(form.store.getState().errors.dateOfBirth).toBe('Enter a valid date.');
    form.setValue('dateOfBirth', '2015-06-01');
    expect(form.validate()).toBe(true);
  });

  it('runs the submission lifecycle and applies external field errors', () => {
    const form = build();
    form.beginSubmit();
    expect(form.store.getState().submission).toBe('submitting');
    const error = new ValidationError('Please correct the highlighted fields.', {
      firstName: 'firstName is required',
    });
    form.failSubmit(error);
    const state = form.store.getState();
    expect(state.submission).toBe('failed');
    expect(state.submitError).toBe(error);
    expect(state.errors.firstName).toBe('firstName is required');
    form.completeSubmit();
    expect(form.store.getState().submission).toBe('submitted');
  });

  it('reset restores the initial state', () => {
    const form = build();
    form.setValue('firstName', 'Ada');
    form.validate();
    form.beginSubmit();
    form.reset();
    expect(form.store.getState()).toEqual({
      values: initial,
      errors: {},
      isDirty: false,
      submission: 'idle',
      submitError: null,
    });
  });
});
