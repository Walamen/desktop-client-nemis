import { randomUUID } from 'node:crypto';
import { ForbiddenError, IPCError } from '@nemis-desktop/shared';
import type {
  SchoolAdminCollection,
  SchoolAdminDeleteRequest,
  SchoolAdminListRequest,
  SchoolAdminListResult,
  SchoolAdminRecord,
  SchoolAdminSaveRequest,
} from '@nemis-desktop/types';
import { DesktopScopeType } from '@nemis-desktop/types';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';

const CONFIG: Record<
  SchoolAdminCollection,
  {
    columns: readonly string[];
    scope:
      'institution' | 'student' | 'guardian' | 'conversation' | 'recipient' | 'school' | 'transfer';
  }
> = {
  institutions: { columns: [], scope: 'institution' },
  students: { columns: [], scope: 'institution' },
  staff: { columns: [], scope: 'institution' },
  classes: { columns: [], scope: 'institution' },
  subjects: { columns: [], scope: 'institution' },
  timetable_entries: { columns: [], scope: 'institution' },
  guardians: {
    columns: [
      'firstName',
      'lastName',
      'relationship',
      'phoneNumber',
      'version',
      'lastModifiedBy',
      'deviceId',
    ],
    scope: 'guardian',
  },
  student_guardians: {
    columns: ['studentId', 'guardianId', 'isPrimary', 'version', 'lastModifiedBy', 'deviceId'],
    scope: 'student',
  },
  student_transfers: {
    columns: [
      'studentId',
      'fromInstitutionId',
      'toInstitutionId',
      'requestedBy',
      'reason',
      'status',
      'reviewedBy',
      'reviewedAt',
      'reviewNotes',
      'requestedDate',
      'toGradeLevel',
    ],
    scope: 'transfer',
  },
  institution_grading_configs: {
    columns: [
      'institutionId',
      'maxMarks',
      'passingMarks',
      'periodsPerTerm',
      'termsPerYear',
      'hasExams',
      'calculationMethod',
      'gradeScale',
      'allowLateSubmission',
      'lateSubmissionPenalty',
      'requireAdminApproval',
    ],
    scope: 'institution',
  },
  grading_periods: {
    columns: [
      'institutionId',
      'academicYearId',
      'termId',
      'name',
      'code',
      'periodType',
      'sequence',
      'maxMarks',
      'passingMarks',
      'weight',
      'startDate',
      'endDate',
      'isActive',
    ],
    scope: 'institution',
  },
  grade_entry_windows: {
    columns: [
      'institutionId',
      'gradingPeriodId',
      'name',
      'description',
      'openDate',
      'closeDate',
      'status',
      'allowedRoles',
      'openedBy',
      'openedAt',
      'closedBy',
      'closedAt',
      'publishedBy',
      'publishedAt',
    ],
    scope: 'institution',
  },
  grade_entry_window_classes: {
    columns: ['windowId', 'classId', 'status', 'openedBy', 'openedAt', 'closedBy', 'closedAt'],
    scope: 'student',
  },
  grades: {
    columns: [
      'studentId',
      'subjectId',
      'assessmentId',
      'marksObtained',
      'examScore',
      'remarks',
      'assessmentScore',
      'finalGrade',
      'testScore',
      'classId',
      'enteredBy',
      'gradePoint',
      'gradingPeriodId',
      'isPublished',
      'lastModifiedBy',
      'letterGrade',
      'maxMarks',
      'percentage',
      'publishedAt',
      'status',
    ],
    scope: 'student',
  },
  fee_rules: {
    columns: [
      'institutionId',
      'name',
      'description',
      'category',
      'amount',
      'currency',
      'applicableLevels',
      'isMandatory',
      'isActive',
      'createdBy',
    ],
    scope: 'institution',
  },
  fee_obligations: {
    columns: [
      'studentId',
      'feeRuleId',
      'institutionId',
      'academicYearId',
      'termId',
      'requiredAmount',
      'totalPaid',
      'status',
      'dueDate',
      'notes',
      'createdBy',
    ],
    scope: 'institution',
  },
  fee_payments: {
    columns: [
      'obligationId',
      'studentId',
      'institutionId',
      'amount',
      'method',
      'reference',
      'notes',
      'receiptNumber',
      'recordedBy',
      'isReversed',
      'paidAt',
    ],
    scope: 'institution',
  },
  announcements: {
    columns: [
      'institutionId',
      'title',
      'content',
      'author',
      'authorRole',
      'priority',
      'targetAudience',
      'publishedAt',
      'expiresAt',
    ],
    scope: 'institution',
  },
  conversations: {
    columns: ['studentId', 'teacherId', 'subject', 'lastMessageAt'],
    scope: 'student',
  },
  messages: {
    columns: ['conversationId', 'senderId', 'senderRole', 'content', 'isRead', 'readAt'],
    scope: 'conversation',
  },
  user_notifications: { columns: ['isRead'], scope: 'recipient' },
  reports: {
    columns: [
      'type',
      'title',
      'description',
      'data',
      'status',
      'comments',
      'schoolId',
      'districtId',
      'countyId',
      'submittedById',
      'reviewedById',
      'submittedAt',
      'reviewedAt',
    ],
    scope: 'school',
  },
  alerts: {
    columns: [
      'countyId',
      'districtId',
      'institutionId',
      'type',
      'severity',
      'title',
      'description',
      'isResolved',
      'resolvedAt',
      'resolvedBy',
      'metadata',
    ],
    scope: 'institution',
  },
  assignments: { columns: [], scope: 'student' },
  assignment_submissions: { columns: [], scope: 'student' },
  class_resources: { columns: [], scope: 'institution' },
};

const ROLE_READ_COLLECTIONS: Readonly<Record<string, ReadonlySet<SchoolAdminCollection>>> = {
  INSTITUTION_ADMIN: new Set(Object.keys(CONFIG) as SchoolAdminCollection[]),
  TEACHER: new Set([
    'institutions',
    'students',
    'staff',
    'classes',
    'subjects',
    'timetable_entries',
    'grades',
    'grading_periods',
    'grade_entry_windows',
    'grade_entry_window_classes',
    'announcements',
    'conversations',
    'messages',
    'user_notifications',
    'assignments',
    'assignment_submissions',
    'class_resources',
  ]),
  COUNTY_ADMIN: new Set([
    'institutions',
    'students',
    'staff',
    'classes',
    'subjects',
    'timetable_entries',
    'student_transfers',
    'fee_rules',
    'announcements',
    'reports',
    'alerts',
  ]),
  DEO: new Set([
    'institutions',
    'students',
    'staff',
    'classes',
    'subjects',
    'timetable_entries',
    'student_transfers',
    'fee_rules',
    'announcements',
    'reports',
    'alerts',
  ]),
  MINISTRY_ADMIN: new Set([
    'institutions',
    'students',
    'staff',
    'classes',
    'subjects',
    'timetable_entries',
    'student_transfers',
    'fee_rules',
    'announcements',
    'reports',
    'alerts',
  ]),
};

const ROLE_WRITE_COLLECTIONS: Readonly<Record<string, ReadonlySet<SchoolAdminCollection>>> = {
  INSTITUTION_ADMIN: new Set(Object.keys(CONFIG) as SchoolAdminCollection[]),
  TEACHER: new Set(['grades', 'messages', 'user_notifications']),
  COUNTY_ADMIN: new Set(['reports', 'alerts']),
  DEO: new Set(['student_transfers', 'reports', 'alerts']),
  MINISTRY_ADMIN: new Set(['reports', 'alerts']),
};

export class SchoolAdminModuleService {
  constructor(private readonly workspaces: WorkspaceManager) {}

  list(request: SchoolAdminListRequest): SchoolAdminListResult {
    const active = this.workspaces.active;
    if (!ROLE_READ_COLLECTIONS[active.user.role]?.has(request.collection)) {
      throw new ForbiddenError('This collection is not available to the active role.');
    }
    const db = active.database.connection;
    const limit = Math.min(request.limit ?? 100, 250);
    const offset = request.offset ?? 0;
    const items = db
      .prepare(`SELECT * FROM ${request.collection} ORDER BY rowid DESC LIMIT ? OFFSET ?`)
      .all(limit, offset) as SchoolAdminRecord[];
    const total = (
      db.prepare(`SELECT COUNT(*) total FROM ${request.collection}`).get() as { total: number }
    ).total;
    return { items: items.map(toWireRecord), total };
  }

  save(request: SchoolAdminSaveRequest): SchoolAdminRecord {
    const { db, scopeId, userId, role } = this.context(request.collection);
    const config = CONFIG[request.collection];
    if (
      [
        'institutions',
        'students',
        'staff',
        'classes',
        'subjects',
        'timetable_entries',
        'assignments',
        'assignment_submissions',
        'class_resources',
        'guardians',
        'student_guardians',
      ].includes(request.collection)
    ) {
      throw new ForbiddenError('Use the dedicated workflow to change this record type.');
    }
    const existing =
      typeof request.record.id === 'string'
        ? (db.prepare(`SELECT * FROM ${request.collection} WHERE id=?`).get(request.record.id) as
            SchoolAdminRecord | undefined)
        : undefined;
    if (request.collection === 'fee_payments' && existing) {
      throw new ForbiddenError('Payments are append-only. Use a payment reversal.');
    }
    if (request.collection === 'user_notifications' && !existing) {
      throw new ForbiddenError('Notifications can only be created by the server.');
    }

    const now = new Date().toISOString();
    const id =
      typeof request.record.id === 'string' && request.record.id ? request.record.id : randomUUID();
    const record: SchoolAdminRecord = {
      ...(existing ?? {}),
      ...request.record,
      id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (role === 'INSTITUTION_ADMIN' && config.scope === 'institution')
      record.institutionId = scopeId;
    if (role === 'INSTITUTION_ADMIN' && request.collection === 'reports') record.schoolId = scopeId;
    if (request.collection === 'fee_payments') {
      const obligationId = request.record.obligationId;
      const obligation =
        typeof obligationId === 'string'
          ? (db
              .prepare(
                `
            SELECT studentId,institutionId,requiredAmount,totalPaid
            FROM fee_obligations WHERE id=?
          `,
              )
              .get(obligationId) as
              | {
                  studentId: string;
                  institutionId: string;
                  requiredAmount: number;
                  totalPaid: number;
                }
              | undefined)
          : undefined;
      const amount = Number(request.record.amount);
      if (!obligation || obligation.institutionId !== scopeId) {
        throw new ForbiddenError('The payment obligation is outside this institution.');
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new IPCError('Payment amount must be greater than zero.');
      }
      record.studentId = obligation.studentId;
      record.recordedBy = userId;
      record.isReversed = false;
    }
    if (request.collection === 'announcements') record.author = userId;
    if (request.collection === 'messages') {
      record.senderId = userId;
      record.senderRole = this.workspaces.active.user.role;
    }
    if (request.collection === 'alerts' && record.isResolved) {
      record.resolvedBy = userId;
      record.resolvedAt = record.resolvedAt ?? now;
    }
    if (request.collection === 'student_transfers' && record.status !== 'PENDING') {
      record.reviewedBy = userId;
      record.reviewedAt = record.reviewedAt ?? now;
    }
    if (request.collection === 'user_notifications') {
      if (existing?.recipientId !== userId)
        throw new ForbiddenError('That notification belongs to another user.');
      record.recipientId = userId;
    }
    this.assertScoped(config.scope, record, scopeId, userId, role);

    const columns = ['id', ...config.columns, 'createdAt', 'updatedAt']
      .filter((column, index, all) => all.indexOf(column) === index)
      .filter((column) => record[column] !== undefined);
    const values = columns.map((column) => sqliteValue(record[column]!));
    const updates = columns.filter((column) => column !== 'id' && column !== 'createdAt');
    const statement = db.prepare(
      `INSERT INTO ${request.collection} (${columns.join(',')})
       VALUES (${columns.map(() => '?').join(',')})
       ON CONFLICT(id) DO UPDATE SET ${updates.map((column) => `${column}=excluded.${column}`).join(',')}`,
    );
    db.transaction(() => {
      statement.run(...values);
      if (request.collection === 'fee_payments') {
        const obligation = db
          .prepare(
            `
          SELECT requiredAmount,totalPaid FROM fee_obligations WHERE id=?
        `,
          )
          .get(record.obligationId) as { requiredAmount: number; totalPaid: number };
        const totalPaid = obligation.totalPaid + Number(record.amount);
        db.prepare(`UPDATE sync_runtime SET captureEnabled=0 WHERE id='singleton'`).run();
        try {
          db.prepare(
            `
            UPDATE fee_obligations SET totalPaid=?,status=?,updatedAt=? WHERE id=?
          `,
          ).run(
            totalPaid,
            totalPaid >= obligation.requiredAmount ? 'PAID_IN_FULL' : 'PARTIALLY_PAID',
            now,
            record.obligationId,
          );
        } finally {
          db.prepare(`UPDATE sync_runtime SET captureEnabled=1 WHERE id='singleton'`).run();
        }
      }
    })();
    return toWireRecord(
      db.prepare(`SELECT * FROM ${request.collection} WHERE id=?`).get(id) as SchoolAdminRecord,
    );
  }

  delete(request: SchoolAdminDeleteRequest): { id: string } {
    const { db, scopeId, userId, role } = this.context(request.collection);
    if (
      request.collection === 'fee_payments' ||
      request.collection === 'user_notifications' ||
      request.collection === 'guardians' ||
      request.collection === 'student_guardians' ||
      request.collection === 'institutions' ||
      request.collection === 'students' ||
      request.collection === 'staff' ||
      request.collection === 'classes' ||
      request.collection === 'subjects' ||
      request.collection === 'timetable_entries'
      || request.collection === 'assignments'
      || request.collection === 'assignment_submissions'
      || request.collection === 'class_resources'
    ) {
      throw new ForbiddenError('This record type cannot be deleted offline.');
    }
    const record = db.prepare(`SELECT * FROM ${request.collection} WHERE id=?`).get(request.id) as
      SchoolAdminRecord | undefined;
    if (!record) throw new IPCError('Record not found.');
    this.assertScoped(CONFIG[request.collection].scope, record, scopeId, userId, role);
    db.prepare(`DELETE FROM ${request.collection} WHERE id=?`).run(request.id);
    return { id: request.id };
  }

  private context(collection: SchoolAdminCollection) {
    const active = this.workspaces.active;
    if (!ROLE_WRITE_COLLECTIONS[active.user.role]?.has(collection)) {
      throw new ForbiddenError('This record type cannot be changed by the active role.');
    }
    if (
      active.user.role === 'INSTITUTION_ADMIN' &&
      active.user.scope.type !== DesktopScopeType.INSTITUTION
    ) {
      throw new ForbiddenError('An institution workspace is required.');
    }
    const scopeId =
      active.user.institutionId ?? active.user.scope.institutionId ?? active.user.scope.scopeId;
    return {
      db: active.database.connection,
      scopeId,
      userId: active.user.id,
      role: active.user.role,
    };
  }

  private assertScoped(
    scope: (typeof CONFIG)[SchoolAdminCollection]['scope'],
    record: SchoolAdminRecord,
    scopeId: string,
    userId: string,
    role: string,
  ): void {
    const db = this.workspaces.active.database.connection;
    if (scope === 'institution') {
      if (role === 'INSTITUTION_ADMIN' && record.institutionId !== scopeId) {
        throw new ForbiddenError('The record is outside this institution workspace.');
      }
      if (role !== 'INSTITUTION_ADMIN') {
        const row =
          typeof record.institutionId === 'string'
            ? (db
                .prepare('SELECT 1 found FROM institutions WHERE id=?')
                .get(record.institutionId) as { found: number } | undefined)
            : undefined;
        if (!row) throw new ForbiddenError('The institution is outside this workspace.');
      }
    }
    if (scope === 'school') {
      if (role === 'INSTITUTION_ADMIN' && record.schoolId !== scopeId) {
        throw new ForbiddenError('The report is outside this institution workspace.');
      }
      if (role !== 'INSTITUTION_ADMIN') {
        const row =
          typeof record.schoolId === 'string'
            ? (db.prepare('SELECT 1 found FROM institutions WHERE id=?').get(record.schoolId) as
                { found: number } | undefined)
            : undefined;
        if (!row) throw new ForbiddenError('The report school is outside this workspace.');
      }
    }
    if (scope === 'recipient' && record.recipientId !== userId) {
      throw new ForbiddenError('The notification belongs to another user.');
    }
    if (scope === 'transfer') {
      if (
        role === 'INSTITUTION_ADMIN' &&
        record.fromInstitutionId !== scopeId &&
        record.toInstitutionId !== scopeId
      ) {
        throw new ForbiddenError('The transfer does not involve this institution.');
      }
      if (role !== 'INSTITUTION_ADMIN') {
        const row = db
          .prepare(
            `
          SELECT 1 found FROM institutions WHERE id IN (?,?) LIMIT 1
        `,
          )
          .get(record.fromInstitutionId, record.toInstitutionId) as { found: number } | undefined;
        if (!row) throw new ForbiddenError('The transfer is outside this workspace.');
      }
    }
    if (scope === 'student') {
      const studentId = record.studentId;
      const classId = record.classId;
      const row =
        typeof studentId === 'string'
          ? (db.prepare('SELECT institutionId FROM students WHERE id=?').get(studentId) as
              { institutionId: string } | undefined)
          : typeof classId === 'string'
            ? (db.prepare('SELECT institutionId FROM classes WHERE id=?').get(classId) as
                { institutionId: string } | undefined)
            : undefined;
      if (!row || row.institutionId !== scopeId)
        throw new ForbiddenError('The related student or class is outside this institution.');
    }
    if (scope === 'conversation') {
      const row = db
        .prepare(
          `
        SELECT s.institutionId FROM conversations c
        JOIN students s ON s.id=c.studentId WHERE c.id=?
      `,
        )
        .get(record.conversationId) as { institutionId: string } | undefined;
      if (!row || row.institutionId !== scopeId)
        throw new ForbiddenError('The conversation is outside this institution.');
    }
    if (scope === 'guardian') {
      const row = db
        .prepare(
          `
        SELECT 1 found FROM student_guardians sg
        JOIN students s ON s.id=sg.studentId
        WHERE sg.guardianId=? AND s.institutionId=? LIMIT 1
      `,
        )
        .get(record.id, scopeId) as { found: number } | undefined;
      if (!row) throw new ForbiddenError('The guardian is outside this institution.');
    }
  }
}

function sqliteValue(value: SchoolAdminRecord[string]): string | number | null {
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function toWireRecord(record: SchoolAdminRecord): SchoolAdminRecord {
  return { ...record };
}
