import { describe, expect, it } from 'vitest';
import { QueryError } from '../errors/repositoryErrors';
import { countFrom, deleteFrom, insertInto, select, updateTable } from './builders';
import { and, eq, lt } from './predicates';

describe('select', () => {
  it('builds SELECT * with no clauses', () => {
    expect(select('devices').build()).toEqual({ sql: 'SELECT * FROM devices', params: [] });
  });

  it('builds a full query with where, order, limit, and offset', () => {
    const built = select('sync_queue')
      .columns('id', 'status')
      .where(eq('status', 'pending'))
      .orderBy('createdAt')
      .orderBy('id', 'desc')
      .limit(50)
      .offset(100)
      .build();
    expect(built.sql).toBe(
      'SELECT id, status FROM sync_queue WHERE status = ? ORDER BY createdAt ASC, id DESC LIMIT ? OFFSET ?',
    );
    expect(built.params).toEqual(['pending', 50, 100]);
  });

  it('ANDs multiple where() calls', () => {
    const built = select('audit_log')
      .where(eq('category', 'sync'))
      .where(lt('createdAt', '2026-01-01'))
      .build();
    expect(built.sql).toBe('SELECT * FROM audit_log WHERE category = ? AND createdAt < ?');
    expect(built.params).toEqual(['sync', '2026-01-01']);
  });

  it('emits LIMIT -1 when only offset is set', () => {
    const built = select('devices').offset(10).build();
    expect(built.sql).toBe('SELECT * FROM devices LIMIT -1 OFFSET ?');
    expect(built.params).toEqual([10]);
  });

  it('rejects negative and non-integer limit/offset', () => {
    expect(() => select('devices').limit(-1)).toThrow(QueryError);
    expect(() => select('devices').offset(1.5)).toThrow(QueryError);
  });

  it('rejects malicious column and table names', () => {
    expect(() => select('devices').columns('id; DROP TABLE x')).toThrow(QueryError);
    expect(() => select('devices').orderBy('a b')).toThrow(QueryError);
  });

  it('rejects a sort direction outside asc/desc at runtime', () => {
    expect(() => select('devices').orderBy('createdAt', 'asc; DROP TABLE x' as never)).toThrow(
      QueryError,
    );
  });

  it('rejects columns() called with no arguments', () => {
    expect(() => select('devices').columns()).toThrow(QueryError);
  });
});

describe('insertInto', () => {
  it('builds a parameterized INSERT', () => {
    const built = insertInto('devices')
      .values({ id: 'd1', deviceName: 'lab', platform: 'win32' })
      .build();
    expect(built.sql).toBe('INSERT INTO devices (id, deviceName, platform) VALUES (?, ?, ?)');
    expect(built.params).toEqual(['d1', 'lab', 'win32']);
  });

  it('rejects an empty row', () => {
    expect(() => insertInto('devices').values({}).build()).toThrow(QueryError);
    expect(() => insertInto('devices').build()).toThrow(QueryError);
  });
});

describe('updateTable', () => {
  it('builds a parameterized UPDATE with WHERE', () => {
    const built = updateTable('devices')
      .set({ deviceName: 'renamed', updatedAt: 't1' })
      .where(eq('id', 'd1'))
      .build();
    expect(built.sql).toBe('UPDATE devices SET deviceName = ?, updatedAt = ? WHERE id = ?');
    expect(built.params).toEqual(['renamed', 't1', 'd1']);
  });

  it('refuses to build without WHERE (no accidental full-table updates)', () => {
    expect(() => updateTable('devices').set({ deviceName: 'x' }).build()).toThrow(QueryError);
  });

  it('refuses to build with an empty SET', () => {
    expect(() => updateTable('devices').where(eq('id', 'd1')).build()).toThrow(QueryError);
  });
});

describe('deleteFrom', () => {
  it('builds a parameterized DELETE with WHERE', () => {
    const built = deleteFrom('sync_queue')
      .where(and(eq('status', 'completed'), lt('createdAt', 't0')))
      .build();
    expect(built.sql).toBe('DELETE FROM sync_queue WHERE (status = ? AND createdAt < ?)');
    expect(built.params).toEqual(['completed', 't0']);
  });

  it('refuses to build without WHERE (no accidental full-table deletes)', () => {
    expect(() => deleteFrom('sync_queue').build()).toThrow(QueryError);
  });
});

describe('countFrom', () => {
  it('builds COUNT with and without WHERE', () => {
    expect(countFrom('devices').build()).toEqual({
      sql: 'SELECT COUNT(*) AS count FROM devices',
      params: [],
    });
    const built = countFrom('sync_queue').where(eq('status', 'pending')).build();
    expect(built.sql).toBe('SELECT COUNT(*) AS count FROM sync_queue WHERE status = ?');
    expect(built.params).toEqual(['pending']);
  });
});
