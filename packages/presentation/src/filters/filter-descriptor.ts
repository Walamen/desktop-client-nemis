export type FilterOperator = 'eq' | 'contains' | 'gte' | 'lte';

/** A declarative filter the UI builds and a (future server-backed) query
 * interprets. Kept as data so sync/server search can adopt it unchanged. */
export interface FilterDescriptor {
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value: string | number | boolean;
}
