import { QueryError } from '../errors/repositoryErrors';
import { assertIdentifier } from './identifiers';

/** The only value types the platform stores. Use isNull() for NULL checks — `eq(col, null)` never matches in SQL. */
export type SqlValue = string | number | null;

type CompareOp = '=' | '!=' | '>' | '>=' | '<' | '<=';

export type Predicate =
  | {
      readonly kind: 'compare';
      readonly column: string;
      readonly op: CompareOp;
      readonly value: SqlValue;
    }
  | { readonly kind: 'like'; readonly column: string; readonly pattern: string }
  | { readonly kind: 'in'; readonly column: string; readonly values: readonly SqlValue[] }
  | { readonly kind: 'null'; readonly column: string; readonly negated: boolean }
  | {
      readonly kind: 'group';
      readonly join: 'AND' | 'OR';
      readonly predicates: readonly Predicate[];
    };

function compare(column: string, op: CompareOp, value: SqlValue): Predicate {
  return { kind: 'compare', column, op, value };
}

export function eq(column: string, value: SqlValue): Predicate {
  return compare(column, '=', value);
}

export function neq(column: string, value: SqlValue): Predicate {
  return compare(column, '!=', value);
}

export function gt(column: string, value: SqlValue): Predicate {
  return compare(column, '>', value);
}

export function gte(column: string, value: SqlValue): Predicate {
  return compare(column, '>=', value);
}

export function lt(column: string, value: SqlValue): Predicate {
  return compare(column, '<', value);
}

export function lte(column: string, value: SqlValue): Predicate {
  return compare(column, '<=', value);
}

export function like(column: string, pattern: string): Predicate {
  return { kind: 'like', column, pattern };
}

export function inList(column: string, values: readonly SqlValue[]): Predicate {
  return { kind: 'in', column, values };
}

export function isNull(column: string): Predicate {
  return { kind: 'null', column, negated: false };
}

export function isNotNull(column: string): Predicate {
  return { kind: 'null', column, negated: true };
}

export function and(...predicates: Predicate[]): Predicate {
  return { kind: 'group', join: 'AND', predicates };
}

export function or(...predicates: Predicate[]): Predicate {
  return { kind: 'group', join: 'OR', predicates };
}

export interface SqlFragment {
  sql: string;
  params: SqlValue[];
}

export function renderPredicate(predicate: Predicate): SqlFragment {
  switch (predicate.kind) {
    case 'compare':
      return {
        sql: `${assertIdentifier(predicate.column)} ${predicate.op} ?`,
        params: [predicate.value],
      };
    case 'like':
      return { sql: `${assertIdentifier(predicate.column)} LIKE ?`, params: [predicate.pattern] };
    case 'in': {
      const column = assertIdentifier(predicate.column);
      if (predicate.values.length === 0) {
        // Empty IN () is a SQL syntax error; match nothing, deterministically.
        return { sql: '1 = 0', params: [] };
      }
      const placeholders = predicate.values.map(() => '?').join(', ');
      return { sql: `${column} IN (${placeholders})`, params: [...predicate.values] };
    }
    case 'null':
      return {
        sql: `${assertIdentifier(predicate.column)} IS ${predicate.negated ? 'NOT NULL' : 'NULL'}`,
        params: [],
      };
    case 'group': {
      if (predicate.predicates.length === 0) {
        throw new QueryError('Predicate groups must contain at least one predicate');
      }
      const parts = predicate.predicates.map(renderPredicate);
      return {
        sql: `(${parts.map((part) => part.sql).join(` ${predicate.join} `)})`,
        params: parts.flatMap((part) => part.params),
      };
    }
  }
}
