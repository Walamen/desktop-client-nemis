import { createHash } from 'node:crypto';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { DatabaseManager } from '@app/database/DatabaseManager';
import {
  PROVISIONING_COLLECTIONS,
  type ProvisioningCollection,
  type ProvisioningRow,
  type ProvisioningSnapshot,
} from '@nemis-desktop/types';

interface ImportContext {
  institutionId: string;
  userId: string;
  serverDeviceId: string;
}

interface TableSpec {
  table: string;
  columns: readonly string[];
}

const SPECS: Record<ProvisioningCollection, TableSpec> = {
  institutions: spec('institutions', ['id','code','name','type','ownership','countyId','districtId','approvalStatus','street','communityTown','latitude','longitude','rejectionReason','profile','version','updatedAt','lastModifiedBy']),
  users: spec('users', ['id','firstName','middleName','lastName','email','isActive','version','updatedAt','lastModifiedBy']),
  userOrganizations: spec('user_organizations', ['id','userId','role','institutionId','countyId','districtId','isActive']),
  academicYears: spec('academic_years', ['id','institutionId','code','startDate','endDate','isCurrent','status','version','updatedAt','lastModifiedBy']),
  terms: spec('terms', ['id','academicYearId','name','startDate','endDate','isCurrent','version','updatedAt','lastModifiedBy']),
  classes: spec('classes', ['id','institutionId','academicYearId','name','gradeLevel','capacity','isActive','section','version','updatedAt','lastModifiedBy']),
  subjects: spec('subjects', ['id','institutionId','name','code','description','isActive','version','updatedAt','lastModifiedBy']),
  classSubjects: spec('class_subjects', ['id','classId','subjectId','assignedAt','version','updatedAt','lastModifiedBy']),
  students: spec('students', ['id','institutionId','firstName','middleName','lastName','admissionNumber','dateOfBirth','gender','gradeLevel','isActive','admissionDate','phoneNumber','email','address','version','updatedAt','lastModifiedBy']),
  guardians: spec('guardians', ['id','firstName','lastName','relationship','phoneNumber','email','address','occupation','isEmergencyContact','version','updatedAt','lastModifiedBy']),
  studentGuardians: spec('student_guardians', ['id','studentId','guardianId','isPrimary','createdAt']),
  enrollments: spec('enrollments', ['id','studentId','classId','academicYearId','termId','enrollmentDate','status','version','updatedAt','lastModifiedBy']),
  staff: spec('staff', ['id','institutionId','userId','firstName','lastName','middleName','dateOfBirth','gender','nationalId','phoneNumber','email','address','employeeNumber','position','employmentType','dateOfJoining','dateOfLeaving','qualifications','isActive','photoUrl','approvalStatus','approvedBy','approvedAt','approvalNotes','createdAt','updatedAt','version','lastModifiedBy']),
  subjectTeachers: spec('subject_teachers', ['id','subjectId','staffId','assignedAt','version','updatedAt','lastModifiedBy']),
  classTeachers: spec('class_teachers', ['id','classId','staffId','isClassTeacher','assignedAt','version','updatedAt','lastModifiedBy']),
  classSubjectTeachers: spec('class_subject_teachers', ['id','classId','subjectId','staffId','assignedAt','version','updatedAt','lastModifiedBy']),
};

const DELETE_ORDER = [...PROVISIONING_COLLECTIONS].reverse();

export class ProvisioningImporter {
  constructor(private readonly manager: DatabaseManager) {}

  getCompletion(): { completedAt: string; institutionId: string; userId: string } | null {
    const row = this.manager.connection
      .prepare(`SELECT completedAt, institutionId, userId FROM provisioning_metadata WHERE id='singleton' AND status='complete'`)
      .get() as { completedAt: string; institutionId: string; userId: string } | undefined;
    return row ?? null;
  }

  import(snapshot: ProvisioningSnapshot, context: ImportContext): void {
    validateEnvelope(snapshot, context);
    const db = this.manager.connection;
    const startedAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO provisioning_metadata
        (id,status,institutionId,userId,serverDeviceId,startedAt,updatedAt,lastError)
      VALUES ('singleton','in_progress',?,?,?,?,?,NULL)
      ON CONFLICT(id) DO UPDATE SET status='in_progress',institutionId=excluded.institutionId,
        userId=excluded.userId,serverDeviceId=excluded.serverDeviceId,
        startedAt=excluded.startedAt,updatedAt=excluded.updatedAt,lastError=NULL
    `).run(context.institutionId, context.userId, context.serverDeviceId, startedAt, startedAt);

    try {
      this.manager.transactions.runImmediate(() => {
        for (const collection of DELETE_ORDER) {
          db.prepare(`DELETE FROM ${SPECS[collection].table}`).run();
        }
        for (const collection of PROVISIONING_COLLECTIONS) {
          insertRows(db, SPECS[collection], snapshot.data[collection]);
        }
        verifyDatabase(db, snapshot);
        const completedAt = new Date().toISOString();
        db.prepare(`
          UPDATE provisioning_metadata SET status='complete',snapshotId=?,checksum=?,
            completedAt=?,updatedAt=?,lastError=NULL WHERE id='singleton'
        `).run(snapshot.snapshotId, snapshot.checksum, completedAt, completedAt);
        db.prepare(`
          UPDATE sync_metadata SET lastSyncAt=?,syncStatus='idle',updatedAt=?
          WHERE id='singleton'
        `).run(completedAt, completedAt);
      });
    } catch (error) {
      const failedAt = new Date().toISOString();
      db.prepare(`
        UPDATE provisioning_metadata SET status='failed',updatedAt=?,lastError=?
        WHERE id='singleton'
      `).run(failedAt, safeError(error));
      throw error;
    }
  }
}

function spec(table: string, columns: readonly string[]): TableSpec {
  return { table, columns };
}

function validateEnvelope(snapshot: ProvisioningSnapshot, context: ImportContext): void {
  if (snapshot.contractVersion !== 1 || snapshot.checksumAlgorithm !== 'sha256') {
    throw new Error('Unsupported provisioning snapshot.');
  }
  if (snapshot.institutionId !== context.institutionId || snapshot.deviceId !== context.serverDeviceId) {
    throw new Error('Provisioning snapshot authorization scope does not match this session.');
  }
  const actual = createHash('sha256').update(JSON.stringify(snapshot.data)).digest('hex');
  if (actual !== snapshot.checksum) throw new Error('Provisioning snapshot checksum verification failed.');
  for (const collection of PROVISIONING_COLLECTIONS) {
    if (snapshot.data[collection].length !== snapshot.manifest[collection]) {
      throw new Error(`Provisioning snapshot manifest mismatch for ${collection}.`);
    }
  }
}

function insertRows(db: SqliteDatabase, table: TableSpec, rows: readonly ProvisioningRow[]): void {
  const placeholders = table.columns.map(() => '?').join(',');
  const statement = db.prepare(
    `INSERT INTO ${table.table} (${table.columns.join(',')}) VALUES (${placeholders})`,
  );
  for (const row of rows) {
    if (typeof row.id !== 'string' || row.id.length === 0) {
      throw new Error(`Provisioning row for ${table.table} has no valid id.`);
    }
    statement.run(...table.columns.map((column) => sqliteValue(row[column])));
  }
}

function sqliteValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' || typeof value === 'number') return value;
  return JSON.stringify(value);
}

function verifyDatabase(db: SqliteDatabase, snapshot: ProvisioningSnapshot): void {
  for (const collection of PROVISIONING_COLLECTIONS) {
    const table = SPECS[collection].table;
    const row = db.prepare(`SELECT COUNT(*) count FROM ${table}`).get() as { count: number };
    if (row.count !== snapshot.manifest[collection]) {
      throw new Error(`Imported row count mismatch for ${collection}.`);
    }
  }
  const dependencies = [
    ['academic_years', 'institutionId', 'institutions'],
    ['classes', 'institutionId', 'institutions'],
    ['classes', 'academicYearId', 'academic_years'],
    ['terms', 'academicYearId', 'academic_years'],
    ['subjects', 'institutionId', 'institutions'],
    ['students', 'institutionId', 'institutions'],
    ['staff', 'institutionId', 'institutions'],
    ['enrollments', 'studentId', 'students'],
    ['enrollments', 'classId', 'classes'],
    ['enrollments', 'academicYearId', 'academic_years'],
    ['enrollments', 'termId', 'terms'],
  ] as const;
  for (const [child, foreignKey, parent] of dependencies) {
    const missing = db.prepare(
      `SELECT COUNT(*) count FROM ${child} c LEFT JOIN ${parent} p ON p.id=c.${foreignKey}
       WHERE c.${foreignKey} IS NOT NULL AND p.id IS NULL`,
    ).get() as { count: number };
    if (missing.count > 0) throw new Error(`Missing dependency ${child}.${foreignKey} -> ${parent}.`);
  }
  const fkViolations = db.pragma('foreign_key_check') as unknown[];
  if (fkViolations.length > 0) throw new Error('Foreign-key verification failed.');
  const integrity = db.pragma('integrity_check', { simple: true }) as string;
  if (integrity !== 'ok') throw new Error('SQLite integrity verification failed.');
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : 'Provisioning failed').slice(0, 1000);
}
