import type { TableName } from '../../../database/schema/tableNames';
import type { Page, PageOptions, QueryOptions, SortSpec } from '../../dto/query';
import { EntityNotFoundError, QueryError, ValidationError } from '../../errors/repositoryErrors';
import { translateDatabaseError } from '../../errors/translateError';
import type { RowMapper } from '../../mappers/RowMapper';
import {
  countFrom,
  deleteFrom,
  insertInto,
  select,
  updateTable,
  type BuiltQuery,
} from '../../queries/builders';
import { eq, type Predicate, type SqlValue } from '../../queries/predicates';
import type { RepositoryContext } from './RepositoryContext';
import { StatementCache } from './StatementCache';

export type SqlRow = Record<string, SqlValue>;

export interface BaseRepositoryConfig<TRow extends SqlRow, TModel> {
  table: TableName;
  entityName: string;
  /** Column whitelist — sort columns are validated against it. */
  columns: readonly string[];
  mapper: RowMapper<TRow, TModel>;
  /** Deterministic default ordering for findAll/findPage. */
  defaultOrderBy?: readonly SortSpec[];
}

const DEFAULT_ORDER: readonly SortSpec[] = [
  { column: 'createdAt', direction: 'asc' },
  { column: 'id', direction: 'asc' },
];

/**
 * Shared machinery behind every SQLite repository. Concrete repositories
 * extend it with entity-specific methods; the entity's *interface* (not this
 * class) is the contract and declares only the operations that make sense.
 * All SQL flows through the query builders; all failures are translated into
 * the RepositoryError taxonomy before leaving the class.
 */
export abstract class BaseRepository<TRow extends SqlRow, TModel> {
  protected readonly context: RepositoryContext;
  protected readonly statements: StatementCache;
  readonly #config: BaseRepositoryConfig<TRow, TModel>;

  protected constructor(context: RepositoryContext, config: BaseRepositoryConfig<TRow, TModel>) {
    this.context = context;
    this.statements = new StatementCache(context.connection);
    this.#config = config;
  }

  findById(id: string): TModel | null {
    return this.query('findById', () => {
      const built = select(this.#config.table).where(eq('id', id)).limit(1).build();
      const row = this.statements.get(built.sql).get(...built.params) as TRow | undefined;
      return row ? this.#config.mapper.toModel(row) : null;
    });
  }

  findByIdOrThrow(id: string): TModel {
    const model = this.findById(id);
    if (model === null) {
      throw new EntityNotFoundError(`${this.#config.entityName} not found: ${id}`);
    }
    return model;
  }

  findAll(options?: QueryOptions): TModel[] {
    return this.query('findAll', () => this.#runList(this.#buildList(options)));
  }

  findPage(options: PageOptions): Page<TModel> {
    return this.query('findPage', () => {
      const items = this.#runList(this.#buildList(options));
      return {
        items,
        total: this.count(),
        limit: options.page.limit,
        offset: options.page.offset,
      };
    });
  }

  exists(id: string): boolean {
    return this.query('exists', () => {
      const built = select(this.#config.table).columns('id').where(eq('id', id)).limit(1).build();
      return this.statements.get(built.sql).get(...built.params) !== undefined;
    });
  }

  count(where?: Predicate): number {
    return this.query('count', () => {
      const builder = countFrom(this.#config.table);
      if (where) {
        builder.where(where);
      }
      const built = builder.build();
      const row = this.statements.get(built.sql).get(...built.params) as { count: number };
      return row.count;
    });
  }

  deleteById(id: string): boolean {
    return this.query('deleteById', () => {
      const built = deleteFrom(this.#config.table).where(eq('id', id)).build();
      return this.statements.get(built.sql).run(...built.params).changes > 0;
    });
  }

  /**
   * Callback-scoped transaction; nested calls become SAVEPOINTs (Phase 2 guarantee).
   * `work`'s own errors propagate unchanged (TransactionManager's contract); only
   * driver-level failures (e.g. commit/rollback itself failing) are translated.
   */
  executeTransaction<T>(work: () => T): T {
    let workThrew = false;
    let workError: unknown;
    try {
      return this.context.transactions.run(() => {
        try {
          return work();
        } catch (error) {
          workThrew = true;
          workError = error;
          throw error;
        }
      });
    } catch (error) {
      if (workThrew && error === workError) {
        throw error;
      }
      const translated = translateDatabaseError(error, `${this.#config.entityName}.transaction`);
      if (translated !== error) {
        this.context.log.error(`${this.#config.entityName}.transaction failed`, translated);
      }
      throw translated;
    }
  }

  /** Error-translation + logging boundary — every public operation runs inside it. */
  protected query<T>(operation: string, fn: () => T): T {
    try {
      return fn();
    } catch (error) {
      const translated = translateDatabaseError(error, `${this.#config.entityName}.${operation}`);
      if (translated !== error) {
        this.context.log.error(`${this.#config.entityName}.${operation} failed`, translated);
      }
      throw translated;
    }
  }

  /** Runs a DTO validator, logging failures at warn (spec: log validation failures). */
  protected validate<T>(validator: (input: T) => void, input: T): void {
    try {
      validator(input);
    } catch (error) {
      if (error instanceof ValidationError) {
        this.context.log.warn(error.message);
      }
      throw error;
    }
  }

  protected insertRow(row: TRow): TModel {
    return this.query('create', () => {
      const built = insertInto(this.#config.table).values(row).build();
      this.statements.get(built.sql).run(...built.params);
      return this.#config.mapper.toModel(row);
    });
  }

  protected insertManyRows(rows: readonly TRow[]): TModel[] {
    if (rows.length === 0) {
      return [];
    }
    try {
      // IMMEDIATE: a known write batch takes the write lock up front.
      return this.context.transactions.runImmediate(() => rows.map((row) => this.insertRow(row)));
    } catch (error) {
      throw translateDatabaseError(error, `${this.#config.entityName}.createMany`);
    }
  }

  protected updateById(id: string, changes: Partial<TRow>): TModel {
    return this.query('update', () => {
      const defined: SqlRow = {};
      for (const [key, value] of Object.entries(changes)) {
        if (value !== undefined) {
          defined[key] = value as SqlValue;
        }
      }
      if (Object.keys(defined).length === 0) {
        throw new QueryError(`${this.#config.entityName}.update: no fields to update`);
      }
      const built = updateTable(this.#config.table).set(defined).where(eq('id', id)).build();
      const result = this.statements.get(built.sql).run(...built.params);
      if (result.changes === 0) {
        throw new EntityNotFoundError(`${this.#config.entityName} not found: ${id}`);
      }
      return this.findByIdOrThrow(id);
    });
  }

  /** Entity-specific finder support: WHERE + the shared ordering/paging rules. */
  protected selectWhere(operation: string, where: Predicate, options?: QueryOptions): TModel[] {
    return this.query(operation, () => this.#runList(this.#buildList(options, where)));
  }

  #buildList(options?: QueryOptions, where?: Predicate): BuiltQuery {
    const builder = select(this.#config.table);
    if (where) {
      builder.where(where);
    }
    const orderBy = options?.orderBy ?? this.#config.defaultOrderBy ?? DEFAULT_ORDER;
    for (const sort of orderBy) {
      if (!this.#config.columns.includes(sort.column)) {
        throw new QueryError(
          `${this.#config.entityName}: cannot sort by unknown column "${sort.column}"`,
        );
      }
      builder.orderBy(sort.column, sort.direction);
    }
    if (options?.page) {
      builder.limit(options.page.limit).offset(options.page.offset);
    }
    return builder.build();
  }

  #runList(built: BuiltQuery): TModel[] {
    const rows = this.statements.get(built.sql).all(...built.params) as TRow[];
    return rows.map((row) => this.#config.mapper.toModel(row));
  }
}
