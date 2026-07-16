import { QueryError } from '../errors/repositoryErrors';

/**
 * SQLite's bound-parameter ceiling is 999 on legacy builds (32766 on modern
 * ones). 900 leaves headroom for the SET columns that accompany a chunked
 * WHERE id IN (...) update. Repositories never encode this limit themselves —
 * they go through BaseRepository.updateByIds.
 */
export const DEFAULT_PARAMETER_CHUNK_SIZE = 900;

export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new QueryError(`Chunk size must be a positive integer, got ${size}`);
  }
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}
