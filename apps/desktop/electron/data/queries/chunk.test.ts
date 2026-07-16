import { describe, expect, it } from 'vitest';
import { QueryError } from '../errors/repositoryErrors';
import { chunkArray, DEFAULT_PARAMETER_CHUNK_SIZE } from './chunk';

describe('chunkArray', () => {
  it('returns [] for an empty input', () => {
    expect(chunkArray([], 3)).toEqual([]);
  });

  it('returns one chunk when items fit', () => {
    expect(chunkArray([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it('splits size+1 items into two chunks', () => {
    expect(chunkArray([1, 2, 3, 4], 3)).toEqual([[1, 2, 3], [4]]);
  });

  it('preserves order across chunks', () => {
    const items = Array.from({ length: 7 }, (_, index) => index);
    expect(chunkArray(items, 2).flat()).toEqual(items);
  });

  it('rejects non-positive and non-integer sizes', () => {
    expect(() => chunkArray([1], 0)).toThrow(QueryError);
    expect(() => chunkArray([1], -1)).toThrow(QueryError);
    expect(() => chunkArray([1], 1.5)).toThrow(QueryError);
  });

  it('exports a default chunk size under the legacy SQLite parameter floor', () => {
    expect(DEFAULT_PARAMETER_CHUNK_SIZE).toBe(900);
  });
});
