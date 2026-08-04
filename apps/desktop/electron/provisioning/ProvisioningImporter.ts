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
  userId: string;
  role: string;
  scopeType: string;
  scopeId: string;
  institutionId?: string;
  serverDeviceId: string;
}

interface ImportOptions {
  /** Keep durable conflict evidence while replacing server-owned rows after sync. */
  preserveConflicts?: boolean;
  /**
   * Delta mode: skip the delete-everything step and upsert instead of
   * insert. The snapshot's manifest counts are a subset, not the full
   * table count, so verifyDatabase's count check is skipped too — its
   * dependency/FK/integrity checks still run.
   */
  merge?: boolean;
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
  attendance: spec('attendance', ['id','studentId','classId','subjectId','date','status','recordedBy','version','updatedAt','lastModifiedBy']),
  staff: spec('staff', ['id','institutionId','userId','firstName','lastName','middleName','dateOfBirth','gender','nationalId','phoneNumber','email','address','employeeNumber','position','employmentType','dateOfJoining','dateOfLeaving','qualifications','isActive','photoUrl','approvalStatus','approvedBy','approvedAt','approvalNotes','createdAt','updatedAt','version','lastModifiedBy']),
  staffDirectory: spec('staff_directory', ['id','institutionId','firstName','lastName','position','photoUrl','email','phoneNumber','isActive','updatedAt']),
  institutionAdmin: spec('institution_admin', ['id','institutionId','firstName','lastName','position','photoUrl','email','phoneNumber','isActive']),
  assessmentTemplates: spec('assessment_templates', ['id','classId','subjectId','name','type','totalMarks','weight','date','createdAt','updatedAt']),
  assessments: spec('assessments', ['id','templateId','classId','subjectId','gradingPeriodId','name','type','totalMarks','weight','date','createdAt','updatedAt']),
  subjectTeachers: spec('subject_teachers', ['id','subjectId','staffId','assignedAt','version','updatedAt','lastModifiedBy']),
  classTeachers: spec('class_teachers', ['id','classId','staffId','isClassTeacher','assignedAt','version','updatedAt','lastModifiedBy']),
  classSubjectTeachers: spec('class_subject_teachers', ['id','classId','subjectId','staffId','assignedAt','version','updatedAt','lastModifiedBy']),
  timetableEntries: spec('timetable_entries', ['id','institutionId','classId','subjectId','staffId','dayOfWeek','startTime','endTime','room','isBreak','assignmentId','createdAt','updatedAt','version','lastModifiedBy']),
  studentTransfers: spec('student_transfers', ['id','studentId','fromInstitutionId','toInstitutionId','requestedBy','reason','status','reviewedBy','reviewedAt','reviewNotes','requestedDate','toGradeLevel','createdAt','updatedAt']),
  institutionGradingConfigs: spec('institution_grading_configs', ['id','institutionId','maxMarks','passingMarks','periodsPerTerm','termsPerYear','hasExams','calculationMethod','gradeScale','allowLateSubmission','lateSubmissionPenalty','requireAdminApproval','createdAt','updatedAt']),
  gradingPeriods: spec('grading_periods', ['id','institutionId','academicYearId','termId','name','code','periodType','sequence','maxMarks','passingMarks','weight','startDate','endDate','isActive','createdAt','updatedAt']),
  gradeEntryWindows: spec('grade_entry_windows', ['id','institutionId','gradingPeriodId','name','description','openDate','closeDate','status','allowedRoles','openedBy','openedAt','closedBy','closedAt','publishedBy','publishedAt','createdAt','updatedAt']),
  gradeEntryWindowClasses: spec('grade_entry_window_classes', ['id','windowId','classId','status','openedBy','openedAt','closedBy','closedAt','createdAt','updatedAt']),
  grades: spec('grades', ['id','studentId','subjectId','assessmentId','marksObtained','examScore','remarks','assessmentScore','finalGrade','testScore','classId','enteredBy','gradePoint','gradingPeriodId','isPublished','lastModifiedBy','letterGrade','maxMarks','percentage','publishedAt','status','createdAt','updatedAt']),
  feeRules: spec('fee_rules', ['id','institutionId','name','description','category','amount','currency','applicableLevels','isMandatory','isActive','createdBy','createdAt','updatedAt']),
  feeObligations: spec('fee_obligations', ['id','studentId','feeRuleId','institutionId','academicYearId','termId','requiredAmount','totalPaid','status','dueDate','notes','createdBy','createdAt','updatedAt']),
  feePayments: spec('fee_payments', ['id','obligationId','studentId','institutionId','amount','method','reference','notes','receiptNumber','recordedBy','isReversed','paidAt','createdAt','updatedAt']),
  announcements: spec('announcements', ['id','institutionId','title','content','author','authorRole','priority','targetAudience','publishedAt','expiresAt','createdAt','updatedAt']),
  conversations: spec('conversations', ['id','studentId','teacherId','subject','lastMessageAt','createdAt','updatedAt']),
  messages: spec('messages', ['id','conversationId','senderId','senderRole','content','isRead','readAt','createdAt','updatedAt']),
  userNotifications: spec('user_notifications', ['id','recipientId','type','title','message','isRead','metadata','link','createdAt','updatedAt']),
  reports: spec('reports', ['id','type','title','description','data','status','comments','schoolId','districtId','countyId','submittedById','reviewedById','submittedAt','reviewedAt','createdAt','updatedAt']),
  alerts: spec('alerts', ['id','countyId','districtId','institutionId','type','severity','title','description','isResolved','resolvedAt','resolvedBy','metadata','createdAt','updatedAt']),
  assignments: spec('assignments', ['id','classId','subjectId','teacherId','title','type','status','description','instructions','dueDate','totalMarks','attachmentUrl','attachmentName','createdAt','updatedAt']),
  assignmentSubmissions: spec('assignment_submissions', ['id','assignmentId','studentId','status','submittedAt','response','fileUrl','fileName','grade','feedback','createdAt','updatedAt']),
  classResources: spec('class_resources', ['id','institutionId','classId','subjectId','staffId','title','description','type','fileUrl','linkUrl','fileSize','fileType','category','isVisible','createdAt','updatedAt']),
};

const DELETE_ORDER = [...PROVISIONING_COLLECTIONS].reverse();

export class ProvisioningImporter {
  constructor(private readonly managerSource: DatabaseManager | (() => DatabaseManager)) {}

  private get manager(): DatabaseManager {
    return typeof this.managerSource === 'function' ? this.managerSource() : this.managerSource;
  }

  getCompletion(): {
    completedAt: string;
    institutionId: string | null;
    userId: string;
    role: string;
    scopeType: string;
    scopeId: string;
  } | null {
    const row = this.manager.connection
      .prepare(`SELECT completedAt,institutionId,userId,role,scopeType,scopeId
        FROM provisioning_metadata WHERE id='singleton' AND status='complete'`)
      .get() as {
        completedAt: string; institutionId: string | null; userId: string;
        role: string; scopeType: string; scopeId: string;
      } | undefined;
    return row ?? null;
  }

  import(
    snapshot: ProvisioningSnapshot,
    context: ImportContext,
    options: ImportOptions = {},
  ): void {
    validateEnvelope(snapshot, context);
    const db = this.manager.connection;
    const startedAt = new Date().toISOString();
    if (options.merge) {
      // A delta merge is a sync step, not a (re)provisioning, and this row's
      // `status` is the gate on ALL future sync — DesktopSyncWorker.syncActive()
      // only proceeds while it reads 'complete', and nothing ever flips it back
      // automatically. Moving it off 'complete' here (to 'in_progress', and then
      // to 'failed' in the catch below) would permanently disable sync for any
      // merge that failed or crashed mid-flight, including the 24h full resync
      // that is the designed self-heal for the very stale-row collisions a merge
      // can hit. The device is already provisioned and validateEnvelope has
      // pinned the snapshot to this same scope, so only the bookkeeping columns
      // move. ('in_progress' has no readers anywhere — it is written for
      // diagnostics only.)
      db.prepare(`
        UPDATE provisioning_metadata SET updatedAt=?,lastError=NULL WHERE id='singleton'
      `).run(startedAt);
    } else {
      db.prepare(`
        INSERT INTO provisioning_metadata
          (id,status,institutionId,userId,role,scopeType,scopeId,serverDeviceId,startedAt,updatedAt,lastError)
        VALUES ('singleton','in_progress',?,?,?,?,?,?,?,?,NULL)
        ON CONFLICT(id) DO UPDATE SET status='in_progress',institutionId=excluded.institutionId,
          userId=excluded.userId,role=excluded.role,scopeType=excluded.scopeType,
          scopeId=excluded.scopeId,serverDeviceId=excluded.serverDeviceId,
          startedAt=excluded.startedAt,updatedAt=excluded.updatedAt,lastError=NULL
      `).run(
        context.institutionId ?? null, context.userId, context.role, context.scopeType,
        context.scopeId, context.serverDeviceId, startedAt, startedAt,
      );
    }

    try {
      this.manager.transactions.runImmediate(() => {
        if (options.preserveConflicts) {
          const active = db.prepare(
            `SELECT COUNT(*) count FROM sync_queue WHERE status IN ('pending','in_flight')`,
          ).get() as { count: number };
          if (active.count > 0) {
            throw new Error('Cannot reconcile a snapshot while local changes are pending.');
          }
        }
        db.prepare(`UPDATE sync_runtime SET captureEnabled=0 WHERE id='singleton'`).run();
        if (!options.merge) {
          for (const collection of DELETE_ORDER) {
            db.prepare(`DELETE FROM ${SPECS[collection].table}`).run();
          }
        }
        for (const collection of PROVISIONING_COLLECTIONS) {
          upsertRows(db, SPECS[collection], snapshot.data[collection], options.merge ?? false);
        }
        verifyDatabase(db, snapshot, { skipCounts: options.merge ?? false });
        if (options.preserveConflicts) {
          db.prepare(`DELETE FROM sync_queue WHERE status='completed'`).run();
        } else {
          db.prepare(`DELETE FROM sync_queue`).run();
        }
        // Dead-lettered queue items survive this import, and listConflicts()
        // builds their user-facing reason from their sync_errors rows — wiping
        // those turns the dead-letter UI into "unknown error" after the next
        // successful sync. Everything else is transient. (The IS NULL arm
        // matters because deleting a sync_queue row nulls its errors'
        // operationId, and `NULL NOT IN (...)` is never true.)
        db.prepare(`
          DELETE FROM sync_errors
          WHERE operationId IS NULL
             OR operationId NOT IN (SELECT id FROM sync_queue WHERE deadLetter=1)
        `).run();
        if (!options.preserveConflicts) db.prepare(`DELETE FROM sync_conflicts`).run();
        db.prepare(`UPDATE sync_runtime SET captureEnabled=1 WHERE id='singleton'`).run();
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
      if (options.merge) {
        // Record the diagnostics but leave `status` on 'complete' — see the
        // merge branch above. A delta merge can legitimately fail on a
        // SECONDARY unique constraint (e.g. students(institutionId,
        // admissionNumber)) when a row the server superseded still exists
        // locally, because merge mode never deletes rows the delta omits. That
        // must surface as a thrown error the caller backs off on, not as a
        // permanent shutdown of sync: the next cycle retries, and the 24h full
        // resync clears the stale row for good.
        db.prepare(`
          UPDATE provisioning_metadata SET updatedAt=?,lastError=? WHERE id='singleton'
        `).run(failedAt, safeError(error));
      } else {
        db.prepare(`
          UPDATE provisioning_metadata SET status='failed',updatedAt=?,lastError=?
          WHERE id='singleton'
        `).run(failedAt, safeError(error));
      }
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
  if (
    snapshot.userId !== context.userId ||
    snapshot.role !== context.role ||
    snapshot.scopeType !== context.scopeType ||
    snapshot.scopeId !== context.scopeId ||
    snapshot.institutionId !== context.institutionId ||
    snapshot.deviceId !== context.serverDeviceId
  ) {
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

function upsertRows(
  db: SqliteDatabase,
  table: TableSpec,
  rows: readonly ProvisioningRow[],
  merge: boolean,
): void {
  const placeholders = table.columns.map(() => '?').join(',');
  const updateSet = table.columns
    .filter((column) => column !== 'id')
    .map((column) => `${column}=excluded.${column}`)
    .join(',');
  const sql = merge
    ? `INSERT INTO ${table.table} (${table.columns.join(',')}) VALUES (${placeholders})
       ON CONFLICT(id) DO UPDATE SET ${updateSet}`
    : `INSERT INTO ${table.table} (${table.columns.join(',')}) VALUES (${placeholders})`;
  const statement = db.prepare(sql);
  for (const row of rows) {
    if (typeof row.id !== 'string' || row.id.length === 0) {
      throw new Error(`Provisioning row for ${table.table} has no valid id.`);
    }
    statement.run(...table.columns.map((column) => sqliteValue(row[column], column)));
  }
}

/** `applicableLevels` is a native array on the server (Prisma `InstitutionLevel[]`)
 * but this app's own fee-rule CRUD (finance/shared.tsx stringifyLevels/parseLevels)
 * stores and reads it as a comma-joined string, matching the generic collection
 * API's string|number|boolean|null value constraint. Provisioned rows must use
 * that same comma-joined format, not the generic JSON.stringify fallback below,
 * or parseLevels silently mis-splits it and excludes every student from the rule. */
function sqliteValue(value: unknown, column: string): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (column === 'applicableLevels' && Array.isArray(value)) return value.join(',');
  return JSON.stringify(value);
}

function verifyDatabase(
  db: SqliteDatabase,
  snapshot: ProvisioningSnapshot,
  options: { skipCounts: boolean } = { skipCounts: false },
): void {
  if (!options.skipCounts) {
    for (const collection of PROVISIONING_COLLECTIONS) {
      const table = SPECS[collection].table;
      const row = db.prepare(`SELECT COUNT(*) count FROM ${table}`).get() as { count: number };
      if (row.count !== snapshot.manifest[collection]) {
        throw new Error(`Imported row count mismatch for ${collection}.`);
      }
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
    ['staff_directory', 'institutionId', 'institutions'],
    ['institution_admin', 'institutionId', 'institutions'],
    ['assessment_templates', 'classId', 'classes'],
    ['assessments', 'templateId', 'assessment_templates'],
    ['enrollments', 'studentId', 'students'],
    ['enrollments', 'classId', 'classes'],
    ['enrollments', 'academicYearId', 'academic_years'],
    ['enrollments', 'termId', 'terms'],
    ['attendance', 'studentId', 'students'],
    ['attendance', 'classId', 'classes'],
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
