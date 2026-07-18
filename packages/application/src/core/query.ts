/** Marker for a read-intent object. Queries never mutate state, never open a
 * UnitOfWork, and never publish events. */
export type Query = Readonly<Record<string, unknown>>;

export interface QueryHandler<TQuery, TResult> {
  execute(query: TQuery): Promise<TResult>;
}
