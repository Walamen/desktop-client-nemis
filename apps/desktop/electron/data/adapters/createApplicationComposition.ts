import {
  createApplicationLayer,
  type ApplicationLayer,
  type ApplicationPorts,
} from '@nemis-desktop/application';
import {
  ConsoleLogger,
  CryptoIdGenerator,
  NoopEventPublisher,
  SystemClock,
} from '@nemis-desktop/application';
import type { IAppLogger } from '@nemis-desktop/application';
import type { DataLayer } from '../factories/createDataLayer';
import { UnitOfWorkAdapter } from './UnitOfWorkAdapter';
import { DeviceGatewayAdapter } from './DeviceGatewayAdapter';
import { SettingsGatewayAdapter } from './SettingsGatewayAdapter';

function notBuilt(name: string): never {
  throw new Error(`${name} repository is not built yet.`);
}

/** Wires the application layer to the real DAL. Dashboard-path and Academic
 * Foundation business ports are real SQLite adapters; the remaining ports
 * (guardians, enrollments, assessments, grades, grading configs) throw until
 * their phase lands. */
export function createApplicationComposition(
  dataLayer: DataLayer,
  currentUserId: string,
  logger: IAppLogger = new ConsoleLogger(),
): ApplicationLayer {
  const ports: ApplicationPorts = {
    currentUserId,
    // Infra — real SQLite.
    deviceGateway: new DeviceGatewayAdapter(dataLayer.repositories.devices),
    settingsGateway: new SettingsGatewayAdapter(
      dataLayer.repositories.appSettings,
      dataLayer.repositories.auditLog,
      dataLayer.transactions,
    ),
    unitOfWork: new UnitOfWorkAdapter(dataLayer.transactions),
    clock: new SystemClock(),
    ids: new CryptoIdGenerator(),
    events: new NoopEventPublisher(),
    logger,
    // Business — real SQLite (Phase 8 dashboard path + Phase 9 academic foundation).
    students: dataLayer.repositories.students,
    institutions: dataLayer.repositories.institutions,
    users: dataLayer.repositories.users,
    academicYears: dataLayer.repositories.academicYears,
    classes: dataLayer.repositories.classes,
    terms: dataLayer.repositories.terms,
    subjects: dataLayer.repositories.subjects,
    attendance: dataLayer.repositories.attendance,
    guardians: dataLayer.repositories.guardians,
    enrollments: dataLayer.repositories.enrollments,
    teachers: dataLayer.repositories.teachers,
    timetables: dataLayer.repositories.timetables,
    assignments: dataLayer.repositories.assignments,
    assignmentSubmissions: dataLayer.repositories.assignmentSubmissions,
    // Not built yet — throw if used.
    assessments: new Proxy({} as never, { get: () => () => notBuilt('Assessment') }),
    grades: new Proxy({} as never, { get: () => () => notBuilt('Grade') }),
    gradingConfigs: new Proxy({} as never, { get: () => () => notBuilt('GradingConfig') }),
  };
  return createApplicationLayer(ports);
}
