/** Converts raw SQLite rows into domain models. Pure — no I/O, no state. */
export interface RowMapper<TRow, TModel> {
  toModel(row: TRow): TModel;
}
