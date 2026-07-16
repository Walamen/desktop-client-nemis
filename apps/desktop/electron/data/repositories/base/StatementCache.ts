import type { Database as SqliteDatabase, Statement } from 'better-sqlite3';

/** Prepared-statement reuse, keyed by exact SQL text. One cache per repository. */
export class StatementCache {
  readonly #db: SqliteDatabase;
  readonly #statements = new Map<string, Statement>();

  constructor(db: SqliteDatabase) {
    this.#db = db;
  }

  get(sql: string): Statement {
    const cached = this.#statements.get(sql);
    if (cached) {
      return cached;
    }
    const statement = this.#db.prepare(sql);
    this.#statements.set(sql, statement);
    return statement;
  }
}
