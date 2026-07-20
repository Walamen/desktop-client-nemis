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
import type { TransactionRunner } from '../services/TransactionRunner';
import { UnitOfWorkAdapter } from './UnitOfWorkAdapter';
import { DeviceGatewayAdapter } from './DeviceGatewayAdapter';
import { SettingsGatewayAdapter } from './SettingsGatewayAdapter';

function notBuilt(name: string): never {
  throw new Error(`${name} repository is not built yet (Phase 6).`);
}

/** Wires the application layer to the real DAL. Infra runs end-to-end; business
 * repository ports throw until their SQLite adapters land in Phase 6. */
export function createApplicationComposition(
  dataLayer: DataLayer,
  transactions: TransactionRunner,
  logger: IAppLogger = new ConsoleLogger(),
): ApplicationLayer {
  const ports: ApplicationPorts = {
    // Infra — wired to real SQLite.
    deviceGateway: new DeviceGatewayAdapter(dataLayer.repositories.devices),
    settingsGateway: new SettingsGatewayAdapter(
      dataLayer.repositories.appSettings,
      dataLayer.repositories.auditLog,
      transactions,
    ),
    unitOfWork: new UnitOfWorkAdapter(transactions),
    clock: new SystemClock(),
    ids: new CryptoIdGenerator(),
    events: new NoopEventPublisher(),
    logger,
    // Business repositories — Phase 6 seam. Typed as their ports; throw if used.
    students: new Proxy({} as never, { get: () => () => notBuilt('Student') }),
    guardians: new Proxy({} as never, { get: () => () => notBuilt('Guardian') }),
    enrollments: new Proxy({} as never, { get: () => () => notBuilt('Enrollment') }),
    classes: new Proxy({} as never, { get: () => () => notBuilt('Class') }),
    academicYears: new Proxy({} as never, { get: () => () => notBuilt('AcademicYear') }),
    attendance: new Proxy({} as never, { get: () => () => notBuilt('Attendance') }),
    assessments: new Proxy({} as never, { get: () => () => notBuilt('Assessment') }),
    grades: new Proxy({} as never, { get: () => () => notBuilt('Grade') }),
    users: new Proxy({} as never, { get: () => () => notBuilt('User') }),
    institutions: new Proxy({} as never, { get: () => () => notBuilt('Institution') }),
    gradingConfigs: new Proxy({} as never, { get: () => () => notBuilt('GradingConfig') }),
  };
  return createApplicationLayer(ports);
}
