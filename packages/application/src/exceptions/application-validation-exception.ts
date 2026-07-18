import { ApplicationException } from './application-exception';

export interface ValidationIssue {
  field: string;
  message: string;
}

/** Input DTO failed application-level validation (shape / required / cross-field),
 * distinct from domain invariants enforced inside entities. */
export class ApplicationValidationException extends ApplicationException {
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, issues: readonly ValidationIssue[]) {
    super('VALIDATION_ERROR', message);
    this.issues = issues;
  }
}
