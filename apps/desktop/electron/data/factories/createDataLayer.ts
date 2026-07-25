import type {
  IStudentRepository,
  IInstitutionRepository,
  IUserRepository,
  IAcademicYearRepository,
  IClassRepository,
  ITermRepository,
  ISubjectRepository,
  IAttendanceRepository,
  IGuardianRepository,
  IEnrollmentRepository,
  ITeacherRepository,
  ITimetableRepository,
} from '@nemis-desktop/application';
import type { DatabaseLogger, DatabaseManager } from '../../database/DatabaseManager';
import { translateDatabaseError } from '../errors/translateError';
import { createRepositoryContext } from '../repositories/base/RepositoryContext';
import type { IAppSettingsRepository } from '../repositories/interfaces/IAppSettingsRepository';
import type { IAuditLogRepository } from '../repositories/interfaces/IAuditLogRepository';
import type { IDeviceRepository } from '../repositories/interfaces/IDeviceRepository';
import type { ISyncMetadataRepository } from '../repositories/interfaces/ISyncMetadataRepository';
import type { ISyncQueueRepository } from '../repositories/interfaces/ISyncQueueRepository';
import { SqliteAcademicYearRepository } from '../repositories/sqlite/business/SqliteAcademicYearRepository';
import { SqliteAttendanceRepository } from '../repositories/sqlite/business/SqliteAttendanceRepository';
import { SqliteClassRepository } from '../repositories/sqlite/business/SqliteClassRepository';
import { SqliteTermRepository } from '../repositories/sqlite/business/SqliteTermRepository';
import { SqliteSubjectRepository } from '../repositories/sqlite/business/SqliteSubjectRepository';
import { SqliteInstitutionRepository } from '../repositories/sqlite/business/SqliteInstitutionRepository';
import { SqliteStudentRepository } from '../repositories/sqlite/business/SqliteStudentRepository';
import { SqliteUserRepository } from '../repositories/sqlite/business/SqliteUserRepository';
import { SqliteGuardianRepository } from '../repositories/sqlite/business/SqliteGuardianRepository';
import { SqliteEnrollmentRepository } from '../repositories/sqlite/business/SqliteEnrollmentRepository';
import { SqliteTeacherRepository } from '../repositories/sqlite/business/SqliteTeacherRepository';
import { SqliteTimetableRepository } from '../repositories/sqlite/business/SqliteTimetableRepository';
import { SqliteAppSettingsRepository } from '../repositories/sqlite/SqliteAppSettingsRepository';
import { SqliteAuditLogRepository } from '../repositories/sqlite/SqliteAuditLogRepository';
import { SqliteDeviceRepository } from '../repositories/sqlite/SqliteDeviceRepository';
import { SqliteSyncMetadataRepository } from '../repositories/sqlite/SqliteSyncMetadataRepository';
import { SqliteSyncQueueRepository } from '../repositories/sqlite/SqliteSyncQueueRepository';
import { AppSettingsService } from '../services/AppSettingsService';
import { AuditLogService } from '../services/AuditLogService';
import { DeviceService } from '../services/DeviceService';
import { SyncMetadataService } from '../services/SyncMetadataService';
import { SyncQueueService } from '../services/SyncQueueService';
import type { TransactionRunner } from '../services/TransactionRunner';

export interface DataLayer {
  repositories: {
    devices: IDeviceRepository;
    appSettings: IAppSettingsRepository;
    syncMetadata: ISyncMetadataRepository;
    syncQueue: ISyncQueueRepository;
    auditLog: IAuditLogRepository;
    students: IStudentRepository;
    institutions: IInstitutionRepository;
    users: IUserRepository;
    academicYears: IAcademicYearRepository;
    classes: IClassRepository;
    terms: ITermRepository;
    subjects: ISubjectRepository;
    attendance: IAttendanceRepository;
    guardians: IGuardianRepository;
    enrollments: IEnrollmentRepository;
    teachers: ITeacherRepository;
    timetables: ITimetableRepository;
  };
  services: {
    device: DeviceService;
    appSettings: AppSettingsService;
    syncMetadata: SyncMetadataService;
    syncQueue: SyncQueueService;
    auditLog: AuditLogService;
  };
  transactions: TransactionRunner;
}

/**
 * Composition root of the data layer. Called once from main.ts after
 * DatabaseManager.initialize(); everything downstream receives interfaces,
 * never concrete SQLite classes.
 */
export function createDataLayer(manager: DatabaseManager, log: DatabaseLogger): DataLayer {
  const context = createRepositoryContext(manager, log);

  const devices = new SqliteDeviceRepository(context);
  const appSettings = new SqliteAppSettingsRepository(context);
  const syncMetadata = new SqliteSyncMetadataRepository(context);
  const syncQueue = new SqliteSyncQueueRepository(context);
  const auditLog = new SqliteAuditLogRepository(context);
  const students = new SqliteStudentRepository(context);
  const institutions = new SqliteInstitutionRepository(context);
  const users = new SqliteUserRepository(context);
  const academicYears = new SqliteAcademicYearRepository(context);
  const classes = new SqliteClassRepository(context);
  const terms = new SqliteTermRepository(context);
  const subjects = new SqliteSubjectRepository(context);
  const attendanceRepo = new SqliteAttendanceRepository(context);
  const guardians = new SqliteGuardianRepository(context);
  const enrollments = new SqliteEnrollmentRepository(context);
  const teachers = new SqliteTeacherRepository(context);
  const timetables = new SqliteTimetableRepository(context);

  // Services see only the RepositoryError taxonomy: failures of the
  // transaction machinery itself (BEGIN/COMMIT, closed-connection errors)
  // are translated here rather than escaping to callers untranslated.
  // Repositories keep using context.transactions directly — errors thrown
  // by repo code inside `work` are RepositoryErrors already and pass through
  // translateDatabaseError unchanged.
  const transactions: TransactionRunner = {
    run: (work) => {
      try {
        return context.transactions.run(work);
      } catch (error) {
        throw translateDatabaseError(error, 'DataLayer.transaction');
      }
    },
    runImmediate: (work) => {
      try {
        return context.transactions.runImmediate(work);
      } catch (error) {
        throw translateDatabaseError(error, 'DataLayer.transaction');
      }
    },
  };

  return {
    repositories: {
      devices,
      appSettings,
      syncMetadata,
      syncQueue,
      auditLog,
      students,
      institutions,
      users,
      academicYears,
      classes,
      terms,
      subjects,
      attendance: attendanceRepo,
      guardians,
      enrollments,
      teachers,
      timetables,
    },
    services: {
      device: new DeviceService({ devices }),
      appSettings: new AppSettingsService({
        appSettings,
        auditLog,
        transactions,
      }),
      syncMetadata: new SyncMetadataService({ syncMetadata }),
      syncQueue: new SyncQueueService({ syncQueue, transactions }),
      auditLog: new AuditLogService({ auditLog }),
    },
    transactions,
  };
}
