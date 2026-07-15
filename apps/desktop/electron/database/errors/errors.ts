/**
 * Database error taxonomy. Raw SQLite errors never cross this boundary:
 * wrapSqliteError() converts them, keeping the original on `cause`.
 */
export type DatabaseErrorCode =
  | 'DB_CONNECTION'
  | 'DB_MIGRATION'
  | 'DB_TRANSACTION'
  | 'DB_CONSTRAINT'
  | 'DB_INTEGRITY'
  | 'DB_BACKUP'
  | 'DB_UNKNOWN';

export interface DatabaseErrorOptions {
  cause?: unknown;
}

export class DatabaseError extends Error {
  readonly code: DatabaseErrorCode;

  constructor(
    message: string,
    code: DatabaseErrorCode = 'DB_UNKNOWN',
    options?: DatabaseErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message: string, options?: DatabaseErrorOptions) {
    super(message, 'DB_CONNECTION', options);
  }
}

export class MigrationError extends DatabaseError {
  constructor(message: string, options?: DatabaseErrorOptions) {
    super(message, 'DB_MIGRATION', options);
  }
}

export class TransactionError extends DatabaseError {
  constructor(message: string, options?: DatabaseErrorOptions) {
    super(message, 'DB_TRANSACTION', options);
  }
}

export class ConstraintError extends DatabaseError {
  constructor(message: string, options?: DatabaseErrorOptions) {
    super(message, 'DB_CONSTRAINT', options);
  }
}

export class IntegrityError extends DatabaseError {
  constructor(message: string, options?: DatabaseErrorOptions) {
    super(message, 'DB_INTEGRITY', options);
  }
}

export class BackupError extends DatabaseError {
  constructor(message: string, options?: DatabaseErrorOptions) {
    super(message, 'DB_BACKUP', options);
  }
}
