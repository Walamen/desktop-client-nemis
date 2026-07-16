import { describe, expect, it } from 'vitest';
import { QueryError } from '../errors/repositoryErrors';
import { assertIdentifier } from './identifiers';
import {
  and,
  eq,
  gt,
  inList,
  isNotNull,
  isNull,
  like,
  lt,
  neq,
  or,
  renderPredicate,
} from './predicates';

describe('assertIdentifier', () => {
  it('accepts plain identifiers', () => {
    expect(assertIdentifier('createdAt')).toBe('createdAt');
    expect(assertIdentifier('sync_queue')).toBe('sync_queue');
    expect(assertIdentifier('_x1')).toBe('_x1');
  });

  it('rejects anything that is not a bare identifier', () => {
    for (const bad of ['id; DROP TABLE devices', 'a b', 'a-b', '1a', '', 'a"b', "a'b", 'a.b']) {
      expect(() => assertIdentifier(bad), bad).toThrow(QueryError);
    }
  });
});

describe('renderPredicate', () => {
  it('renders comparisons with parameterized values', () => {
    expect(renderPredicate(eq('status', 'pending'))).toEqual({
      sql: 'status = ?',
      params: ['pending'],
    });
    expect(renderPredicate(neq('retryCount', 0))).toEqual({
      sql: 'retryCount != ?',
      params: [0],
    });
    expect(renderPredicate(gt('createdAt', '2026-01-01'))).toEqual({
      sql: 'createdAt > ?',
      params: ['2026-01-01'],
    });
    expect(renderPredicate(lt('createdAt', '2026-02-01'))).toEqual({
      sql: 'createdAt < ?',
      params: ['2026-02-01'],
    });
  });

  it('renders LIKE with a parameterized pattern', () => {
    expect(renderPredicate(like('event', 'sync.%'))).toEqual({
      sql: 'event LIKE ?',
      params: ['sync.%'],
    });
  });

  it('renders IN with one placeholder per value', () => {
    expect(renderPredicate(inList('id', ['a', 'b', 'c']))).toEqual({
      sql: 'id IN (?, ?, ?)',
      params: ['a', 'b', 'c'],
    });
  });

  it('renders an empty IN as a match-nothing predicate', () => {
    expect(renderPredicate(inList('id', []))).toEqual({ sql: '1 = 0', params: [] });
  });

  it('renders IS NULL / IS NOT NULL without params', () => {
    expect(renderPredicate(isNull('lastSyncAt'))).toEqual({
      sql: 'lastSyncAt IS NULL',
      params: [],
    });
    expect(renderPredicate(isNotNull('payload'))).toEqual({
      sql: 'payload IS NOT NULL',
      params: [],
    });
  });

  it('renders AND/OR groups with parentheses and ordered params', () => {
    const predicate = and(eq('status', 'pending'), or(gt('retryCount', 3), isNull('payload')));
    expect(renderPredicate(predicate)).toEqual({
      sql: '(status = ? AND (retryCount > ? OR payload IS NULL))',
      params: ['pending', 3],
    });
  });

  it('rejects empty groups', () => {
    expect(() => renderPredicate(and())).toThrow(QueryError);
  });

  it('rejects malicious column names in every predicate kind', () => {
    expect(() => renderPredicate(eq('id; DROP TABLE x', 1))).toThrow(QueryError);
    expect(() => renderPredicate(inList('a b', [1]))).toThrow(QueryError);
    expect(() => renderPredicate(inList('a b', []))).toThrow(QueryError);
    expect(() => renderPredicate(isNull('a"b'))).toThrow(QueryError);
  });
});
