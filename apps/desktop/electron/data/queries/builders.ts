import type { TableName } from '../../database/schema/tableNames';
import { QueryError } from '../errors/repositoryErrors';
import { assertIdentifier } from './identifiers';
import { renderPredicate, type Predicate, type SqlValue } from './predicates';

export interface BuiltQuery {
  sql: string;
  params: SqlValue[];
}

export type SortDirection = 'asc' | 'desc';

function assertNonNegativeInt(value: number, clause: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new QueryError(`${clause} must be a non-negative integer, got ${value}`);
  }
  return value;
}

function renderWhere(predicates: readonly Predicate[], params: SqlValue[]): string {
  if (predicates.length === 0) {
    return '';
  }
  const parts = predicates.map(renderPredicate);
  for (const part of parts) {
    params.push(...part.params);
  }
  return ` WHERE ${parts.map((part) => part.sql).join(' AND ')}`;
}

export class SelectBuilder {
  readonly #table: string;
  #columns: readonly string[] | null = null;
  readonly #predicates: Predicate[] = [];
  readonly #order: { column: string; direction: SortDirection }[] = [];
  #limit: number | null = null;
  #offset: number | null = null;

  constructor(table: TableName) {
    this.#table = assertIdentifier(table);
  }

  columns(...columns: string[]): this {
    this.#columns = columns.map(assertIdentifier);
    return this;
  }

  where(predicate: Predicate): this {
    this.#predicates.push(predicate);
    return this;
  }

  orderBy(column: string, direction: SortDirection = 'asc'): this {
    this.#order.push({ column: assertIdentifier(column), direction });
    return this;
  }

  limit(count: number): this {
    this.#limit = assertNonNegativeInt(count, 'LIMIT');
    return this;
  }

  offset(count: number): this {
    this.#offset = assertNonNegativeInt(count, 'OFFSET');
    return this;
  }

  build(): BuiltQuery {
    const params: SqlValue[] = [];
    let sql = `SELECT ${this.#columns ? this.#columns.join(', ') : '*'} FROM ${this.#table}`;
    sql += renderWhere(this.#predicates, params);
    if (this.#order.length > 0) {
      const order = this.#order
        .map((entry) => `${entry.column} ${entry.direction.toUpperCase()}`)
        .join(', ');
      sql += ` ORDER BY ${order}`;
    }
    // LIMIT/OFFSET are parameterized so the SQL text (statement-cache key)
    // stays stable across page sizes. SQLite needs LIMIT before OFFSET;
    // LIMIT -1 means "no limit".
    if (this.#limit !== null) {
      sql += ' LIMIT ?';
      params.push(this.#limit);
    } else if (this.#offset !== null) {
      sql += ' LIMIT -1';
    }
    if (this.#offset !== null) {
      sql += ' OFFSET ?';
      params.push(this.#offset);
    }
    return { sql, params };
  }
}

export class InsertBuilder {
  readonly #table: string;
  #row: Record<string, SqlValue> | null = null;

  constructor(table: TableName) {
    this.#table = assertIdentifier(table);
  }

  values(row: Record<string, SqlValue>): this {
    this.#row = row;
    return this;
  }

  build(): BuiltQuery {
    if (this.#row === null || Object.keys(this.#row).length === 0) {
      throw new QueryError('INSERT requires at least one column');
    }
    const row = this.#row;
    const columns = Object.keys(row).map(assertIdentifier);
    return {
      sql: `INSERT INTO ${this.#table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      params: columns.map((column) => row[column]),
    };
  }
}

export class UpdateBuilder {
  readonly #table: string;
  #changes: Record<string, SqlValue> | null = null;
  readonly #predicates: Predicate[] = [];

  constructor(table: TableName) {
    this.#table = assertIdentifier(table);
  }

  set(changes: Record<string, SqlValue>): this {
    this.#changes = changes;
    return this;
  }

  where(predicate: Predicate): this {
    this.#predicates.push(predicate);
    return this;
  }

  build(): BuiltQuery {
    if (this.#changes === null || Object.keys(this.#changes).length === 0) {
      throw new QueryError('UPDATE requires at least one SET column');
    }
    if (this.#predicates.length === 0) {
      throw new QueryError('UPDATE requires a WHERE clause — full-table updates are not allowed');
    }
    const changes = this.#changes;
    const columns = Object.keys(changes).map(assertIdentifier);
    const params: SqlValue[] = columns.map((column) => changes[column]);
    let sql = `UPDATE ${this.#table} SET ${columns.map((column) => `${column} = ?`).join(', ')}`;
    sql += renderWhere(this.#predicates, params);
    return { sql, params };
  }
}

export class DeleteBuilder {
  readonly #table: string;
  readonly #predicates: Predicate[] = [];

  constructor(table: TableName) {
    this.#table = assertIdentifier(table);
  }

  where(predicate: Predicate): this {
    this.#predicates.push(predicate);
    return this;
  }

  build(): BuiltQuery {
    if (this.#predicates.length === 0) {
      throw new QueryError('DELETE requires a WHERE clause — full-table deletes are not allowed');
    }
    const params: SqlValue[] = [];
    const sql = `DELETE FROM ${this.#table}${renderWhere(this.#predicates, params)}`;
    return { sql, params };
  }
}

export class CountBuilder {
  readonly #table: string;
  readonly #predicates: Predicate[] = [];

  constructor(table: TableName) {
    this.#table = assertIdentifier(table);
  }

  where(predicate: Predicate): this {
    this.#predicates.push(predicate);
    return this;
  }

  build(): BuiltQuery {
    const params: SqlValue[] = [];
    const sql = `SELECT COUNT(*) AS count FROM ${this.#table}${renderWhere(this.#predicates, params)}`;
    return { sql, params };
  }
}

export function select(table: TableName): SelectBuilder {
  return new SelectBuilder(table);
}

export function insertInto(table: TableName): InsertBuilder {
  return new InsertBuilder(table);
}

export function updateTable(table: TableName): UpdateBuilder {
  return new UpdateBuilder(table);
}

export function deleteFrom(table: TableName): DeleteBuilder {
  return new DeleteBuilder(table);
}

export function countFrom(table: TableName): CountBuilder {
  return new CountBuilder(table);
}
