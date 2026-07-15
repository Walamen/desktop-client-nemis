/** Canonical platform table names — single source of truth for services/tests. */
export const TableNames = {
  schemaMigrations: 'schema_migrations',
  devices: 'devices',
  appSettings: 'app_settings',
  syncMetadata: 'sync_metadata',
  syncQueue: 'sync_queue',
  syncErrors: 'sync_errors',
  auditLog: 'audit_log',
} as const;

export type TableName = (typeof TableNames)[keyof typeof TableNames];
