import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import { installOutboxTriggers } from './010-create-sync-outbox';

const MUTABLE_TABLES = [
  'student_transfers',
  'institution_grading_configs',
  'grading_periods',
  'grade_entry_windows',
  'grade_entry_window_classes',
  'grades',
  'fee_rules',
  'fee_obligations',
  'fee_payments',
  'announcements',
  'conversations',
  'messages',
  'user_notifications',
  'reports',
  'alerts',
] as const;

export const createSchoolAdminModules: Migration = {
  version: 11,
  name: 'create-school-admin-modules',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE student_transfers (
        id TEXT PRIMARY KEY, studentId TEXT NOT NULL, fromInstitutionId TEXT NOT NULL,
        toInstitutionId TEXT NOT NULL, requestedBy TEXT NOT NULL, reason TEXT NOT NULL,
        status TEXT NOT NULL, reviewedBy TEXT, reviewedAt TEXT, reviewNotes TEXT,
        requestedDate TEXT, toGradeLevel TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_student_transfers_scope ON student_transfers (fromInstitutionId,toInstitutionId,status);

      CREATE TABLE institution_grading_configs (
        id TEXT PRIMARY KEY, institutionId TEXT NOT NULL UNIQUE, maxMarks REAL NOT NULL,
        passingMarks REAL NOT NULL, periodsPerTerm INTEGER NOT NULL, termsPerYear INTEGER NOT NULL,
        hasExams INTEGER NOT NULL, calculationMethod TEXT NOT NULL, gradeScale TEXT NOT NULL,
        allowLateSubmission INTEGER NOT NULL, lateSubmissionPenalty REAL,
        requireAdminApproval INTEGER NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE TABLE grading_periods (
        id TEXT PRIMARY KEY, institutionId TEXT NOT NULL, academicYearId TEXT NOT NULL,
        termId TEXT NOT NULL, name TEXT NOT NULL, code TEXT NOT NULL, periodType TEXT NOT NULL,
        sequence INTEGER NOT NULL, maxMarks REAL NOT NULL, passingMarks REAL NOT NULL,
        weight REAL, startDate TEXT NOT NULL, endDate TEXT NOT NULL, isActive INTEGER NOT NULL,
        createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_grading_periods_scope ON grading_periods (institutionId,academicYearId,termId);
      CREATE TABLE grade_entry_windows (
        id TEXT PRIMARY KEY, institutionId TEXT NOT NULL, gradingPeriodId TEXT NOT NULL,
        name TEXT NOT NULL, description TEXT, openDate TEXT NOT NULL, closeDate TEXT NOT NULL,
        status TEXT NOT NULL, allowedRoles TEXT NOT NULL, openedBy TEXT, openedAt TEXT,
        closedBy TEXT, closedAt TEXT, publishedBy TEXT, publishedAt TEXT,
        createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_grade_windows_scope ON grade_entry_windows (institutionId,status);
      CREATE TABLE grade_entry_window_classes (
        id TEXT PRIMARY KEY, windowId TEXT NOT NULL, classId TEXT NOT NULL, status TEXT NOT NULL,
        openedBy TEXT, openedAt TEXT, closedBy TEXT, closedAt TEXT,
        createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
        UNIQUE(windowId,classId)
      );
      CREATE TABLE grades (
        id TEXT PRIMARY KEY, studentId TEXT NOT NULL, subjectId TEXT NOT NULL,
        assessmentId TEXT, marksObtained REAL NOT NULL, examScore REAL, remarks TEXT,
        assessmentScore REAL, finalGrade TEXT, testScore REAL, classId TEXT, enteredBy TEXT,
        gradePoint REAL, gradingPeriodId TEXT, isPublished INTEGER NOT NULL,
        lastModifiedBy TEXT, letterGrade TEXT, maxMarks REAL NOT NULL, percentage REAL,
        publishedAt TEXT, status TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_grades_scope ON grades (classId,gradingPeriodId,studentId,subjectId);

      CREATE TABLE fee_rules (
        id TEXT PRIMARY KEY, institutionId TEXT, name TEXT NOT NULL, description TEXT,
        category TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL,
        applicableLevels TEXT NOT NULL, isMandatory INTEGER NOT NULL, isActive INTEGER NOT NULL,
        createdBy TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_fee_rules_scope ON fee_rules (institutionId,isActive);
      CREATE TABLE fee_obligations (
        id TEXT PRIMARY KEY, studentId TEXT NOT NULL, feeRuleId TEXT NOT NULL,
        institutionId TEXT NOT NULL, academicYearId TEXT NOT NULL, termId TEXT NOT NULL,
        requiredAmount REAL NOT NULL, totalPaid REAL NOT NULL, status TEXT NOT NULL,
        dueDate TEXT, notes TEXT, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL, UNIQUE(studentId,feeRuleId,academicYearId,termId)
      );
      CREATE INDEX idx_fee_obligations_scope ON fee_obligations (institutionId,status);
      CREATE TABLE fee_payments (
        id TEXT PRIMARY KEY, obligationId TEXT NOT NULL, studentId TEXT NOT NULL,
        institutionId TEXT NOT NULL, amount REAL NOT NULL, method TEXT NOT NULL,
        reference TEXT, notes TEXT, receiptNumber TEXT NOT NULL UNIQUE, recordedBy TEXT NOT NULL,
        isReversed INTEGER NOT NULL, paidAt TEXT NOT NULL, createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_fee_payments_scope ON fee_payments (institutionId,paidAt);

      CREATE TABLE announcements (
        id TEXT PRIMARY KEY, institutionId TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
        author TEXT NOT NULL, authorRole TEXT, priority TEXT NOT NULL, targetAudience TEXT,
        publishedAt TEXT, expiresAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY, studentId TEXT NOT NULL, teacherId TEXT NOT NULL, subject TEXT,
        lastMessageAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
        UNIQUE(studentId,teacherId)
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY, conversationId TEXT NOT NULL, senderId TEXT NOT NULL,
        senderRole TEXT NOT NULL, content TEXT NOT NULL, isRead INTEGER NOT NULL,
        readAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_messages_conversation ON messages (conversationId,createdAt);
      CREATE TABLE user_notifications (
        id TEXT PRIMARY KEY, recipientId TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
        message TEXT NOT NULL, isRead INTEGER NOT NULL, metadata TEXT, link TEXT,
        createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_notifications_recipient ON user_notifications (recipientId,isRead,createdAt);
      CREATE TABLE reports (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, description TEXT,
        data TEXT NOT NULL, status TEXT NOT NULL, comments TEXT, schoolId TEXT,
        districtId TEXT, countyId TEXT, submittedById TEXT, reviewedById TEXT,
        submittedAt TEXT, reviewedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_reports_scope ON reports (schoolId,districtId,countyId,status);
      CREATE TABLE alerts (
        id TEXT PRIMARY KEY, countyId TEXT, districtId TEXT, institutionId TEXT,
        type TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL,
        description TEXT NOT NULL, isResolved INTEGER NOT NULL, resolvedAt TEXT,
        resolvedBy TEXT, metadata TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_alerts_scope ON alerts (institutionId,districtId,countyId,isResolved);
    `);
    installOutboxTriggers(db, MUTABLE_TABLES);
  },
};
