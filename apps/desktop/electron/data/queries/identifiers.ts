import { QueryError } from '../errors/repositoryErrors';

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * SQL identifiers (table/column names) cannot be parameterized — the only
 * defense is refusing anything that is not a bare identifier.
 */
export function assertIdentifier(name: string): string {
  if (!IDENTIFIER_PATTERN.test(name)) {
    throw new QueryError(`Invalid SQL identifier: "${name}"`);
  }
  return name;
}
