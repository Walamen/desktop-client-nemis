/** The standard envelope every use case returns to callers. Never exposes
 * domain entities or database rows — only DTOs. */
export interface ApplicationResponse<T> {
  readonly data: T;
  readonly warnings?: readonly string[];
}

export function ok<T>(data: T, warnings?: readonly string[]): ApplicationResponse<T> {
  return warnings && warnings.length > 0 ? { data, warnings } : { data };
}
