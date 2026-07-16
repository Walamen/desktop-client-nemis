import { RepositoryError } from '../errors/repositoryErrors';

/** Parses a JSON TEXT column; corrupt content is a data-integrity failure, not a caller error. */
export function parseJsonColumn(text: string | null, context: string): unknown {
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new RepositoryError(`${context}: stored JSON is corrupt`, 'REPO_UNKNOWN', {
      cause: error,
    });
  }
}

/** undefined → NULL; everything else JSON-serialized (null stores as the string 'null'). */
export function serializeJsonColumn(value: unknown, context: string): string | null {
  if (value === undefined) {
    return null;
  }
  try {
    const text = JSON.stringify(value);
    if (text === undefined) {
      throw new Error('value has no JSON representation');
    }
    return text;
  } catch (error) {
    throw new RepositoryError(`${context}: value is not JSON-serializable`, 'REPO_UNKNOWN', {
      cause: error,
    });
  }
}
