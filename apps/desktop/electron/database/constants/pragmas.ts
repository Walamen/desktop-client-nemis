/**
 * SQLite configuration for a single-user desktop workload.
 *
 * journal_mode = WAL          — readers never block the writer; survives crashes;
 *                               required for online backup while the app runs.
 * synchronous = NORMAL        — with WAL, NORMAL only risks losing the last
 *                               transactions on OS/power failure, never corruption.
 *                               FULL would double fsync cost for no integrity gain.
 * foreign_keys = ON           — SQLite defaults OFF per connection; we require
 *                               referential integrity everywhere.
 * busy_timeout = 5000 ms      — a second process (backup validation, tooling)
 *                               waits instead of failing instantly with SQLITE_BUSY.
 * cache_size = -64000 (64 MiB)— negative = KiB units; desktop machines can afford
 *                               a large page cache; biggest single query-speed lever.
 * temp_store = MEMORY         — temp b-trees (ORDER BY/GROUP BY spills) stay in RAM.
 * wal_autocheckpoint = 1000   — default made explicit: checkpoint every ~4 MB of WAL.
 * journal_size_limit = 64 MiB — caps WAL file growth after big transactions.
 */
export const PRAGMAS = {
  journalMode: 'WAL',
  synchronous: 'NORMAL',
  foreignKeys: 'ON',
  busyTimeoutMs: 5000,
  cacheSizeKib: 64000,
  tempStore: 'MEMORY',
  walAutocheckpointPages: 1000,
  journalSizeLimitBytes: 64 * 1024 * 1024,
} as const;
