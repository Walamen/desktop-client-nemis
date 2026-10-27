/**
 * Repository error taxonomy — the only error family that leaves the data
 * layer. Parallel to (not extending) the database-layer DatabaseError family:
 * driver and platform errors are translated at the repository boundary and
 * kept on `cause`.
 */
export type RepositoryErrorCode =
  | 'REPO_NOT_FOUND'
  | 'REPO_DUPLICATE'
  | 'REPO_VALIDATION'
  | 'REPO_TRANSACTION'
  | 'REPO_QUERY'
  | 'REPO_UNKNOWN';

export interface RepositoryErrorOptions {
  cause?: unknown;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;

  constructor(
    message: string,
    code: RepositoryErrorCode = 'REPO_UNKNOWN',
    options?: RepositoryErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class EntityNotFoundError extends RepositoryError {
  constructor(message: string, options?: RepositoryErrorOptions) {
    super(message, 'REPO_NOT_FOUND', options);
  }
}

export class DuplicateEntityError extends RepositoryError {
  constructor(message: string, options?: RepositoryErrorOptions) {
    super(message, 'REPO_DUPLICATE', options);
  }
}

export class TransactionFailureError extends RepositoryError {
  constructor(message: string, options?: RepositoryErrorOptions) {
    super(message, 'REPO_TRANSACTION', options);
  }
}

export class QueryError extends RepositoryError {
  constructor(message: string, options?: RepositoryErrorOptions) {
    super(message, 'REPO_QUERY', options);
  }
}

export class ValidationError extends RepositoryError {
  readonly issues: readonly ValidationIssue[];

  constructor(
    message: string,
    issues: readonly ValidationIssue[],
    options?: RepositoryErrorOptions,
  ) {
    super(message, 'REPO_VALIDATION', options);
    this.issues = issues;
  }
}

/** Copying a year's structure into a target that is not a bare SETUP year. It
 * crosses IPC as its own code so the screen can tell it from other validation
 * failures (a malformed stored date stays a plain ValidationError). */
export class YearStructureNotEmptyError extends ValidationError {
  constructor(message: string) {
    super(message, [{ field: 'targetYearId', message }]);
  }
}
