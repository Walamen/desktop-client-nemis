import { createStore } from 'zustand/vanilla';
import type { SubmissionStatus } from '../core/submission';
import { ValidationError, type PresentationError } from '../errors';
import type { FormValidator } from '../validators/form-validators';

export interface FormState<TValues extends Record<string, unknown>> {
  readonly values: TValues;
  readonly errors: Readonly<Partial<Record<keyof TValues & string, string>>>;
  readonly isDirty: boolean;
  readonly submission: SubmissionStatus;
  readonly submitError: PresentationError | null;
}

/** Reusable form state machine: values, per-field errors, dirty tracking,
 * reset, and submission lifecycle. Framework-free; React binds later. */
export class FormManager<TValues extends Record<string, unknown>> {
  readonly store;
  private readonly initialValues: TValues;

  constructor(
    initialValues: TValues,
    private readonly validators: readonly FormValidator<TValues>[] = [],
  ) {
    this.initialValues = { ...initialValues };
    this.store = createStore<FormState<TValues>>(() => ({
      values: { ...initialValues },
      errors: {} as Partial<Record<keyof TValues & string, string>>,
      isDirty: false,
      submission: 'idle',
      submitError: null,
    }));
  }

  setValue<K extends keyof TValues & string>(field: K, value: TValues[K]): void {
    const state = this.store.getState();
    const values = { ...state.values };
    values[field] = value;
    const errors = { ...state.errors };
    delete errors[field];
    const isDirty = (Object.keys(values) as (keyof TValues & string)[]).some(
      (key) => !Object.is(values[key], this.initialValues[key]),
    );
    this.store.setState({ values, errors, isDirty });
  }

  validate(): boolean {
    const values = this.store.getState().values;
    let errors: Partial<Record<keyof TValues & string, string>> = {};
    for (const validator of this.validators) errors = { ...errors, ...validator(values) };
    this.store.setState({ errors });
    return Object.keys(errors).length === 0;
  }

  reset(): void {
    this.store.setState(
      {
        values: { ...this.initialValues },
        errors: {} as Partial<Record<keyof TValues & string, string>>,
        isDirty: false,
        submission: 'idle',
        submitError: null,
      },
      true,
    );
  }

  beginSubmit(): void {
    this.store.setState({ submission: 'submitting', submitError: null });
  }

  completeSubmit(): void {
    this.store.setState({ submission: 'submitted' });
  }

  failSubmit(error: PresentationError): void {
    this.store.setState({ submission: 'failed', submitError: error });
    this.applyExternalErrors(error);
  }

  /** Copies field errors from a command's ValidationError onto the form. */
  applyExternalErrors(error: PresentationError): void {
    if (!(error instanceof ValidationError)) return;
    const errors: Record<string, string | undefined> = { ...this.store.getState().errors };
    for (const [field, message] of Object.entries(error.fieldErrors)) errors[field] = message;
    this.store.setState({
      errors: errors as Partial<Record<keyof TValues & string, string>>,
    });
  }
}
