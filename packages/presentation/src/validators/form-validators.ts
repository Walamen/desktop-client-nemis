/** Presentational validators only (required/format/length). Business rules
 * stay in the application and domain layers. */
export type FormValidator<TValues> = (
  values: TValues,
) => Partial<Record<keyof TValues & string, string>>;

export function required<TValues>(
  ...fields: readonly (keyof TValues & string)[]
): FormValidator<TValues> {
  return (values) => {
    const errors: Partial<Record<keyof TValues & string, string>> = {};
    for (const field of fields) {
      const value = values[field];
      if (
        value === null ||
        value === undefined ||
        (typeof value === 'string' && value.trim() === '')
      ) {
        errors[field] = 'This field is required.';
      }
    }
    return errors;
  };
}

export function maxLength<TValues>(
  field: keyof TValues & string,
  max: number,
): FormValidator<TValues> {
  return (values) => {
    const value = values[field];
    return typeof value === 'string' && value.length > max
      ? ({ [field]: `Must be at most ${max} characters.` } as Partial<
          Record<keyof TValues & string, string>
        >)
      : {};
  };
}

/** Accepts an ISO-8601 date (YYYY-MM-DD, optional time) that also parses to a
 * real calendar date — rejects Date.parse-permissive non-ISO strings like
 * "01/02/2020" that the validator's name would otherwise silently allow. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

export function isoDate<TValues>(field: keyof TValues & string): FormValidator<TValues> {
  return (values) => {
    const value = values[field];
    if (typeof value !== 'string' || value === '') return {};
    const valid = ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));
    return valid
      ? {}
      : ({ [field]: 'Enter a valid date.' } as Partial<Record<keyof TValues & string, string>>);
  };
}
