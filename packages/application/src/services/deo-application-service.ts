import type {
  DeoDashboardResult,
  DeoSchoolAdminsResult,
  DeoSchoolsResult,
  DeoStudentsResult,
  DeoTeachersResult,
  DeoTransfersResult,
} from '@nemis-desktop/types';
import type { ApplicationResponse } from '../core/response';
import type { GetDeoDashboardUseCase } from '../use-cases/deo/get-deo-dashboard';
import type { ResolveDistrictAlertUseCase } from '../use-cases/deo/resolve-district-alert';
import type { GetDeoSchoolsUseCase } from '../use-cases/deo/get-deo-schools';
import type { GetDeoSchoolAdminsUseCase } from '../use-cases/deo/get-deo-school-admins';
import type { GetDeoTeachersUseCase } from '../use-cases/deo/get-deo-teachers';
import type { GetDeoStudentsUseCase } from '../use-cases/deo/get-deo-students';
import type { GetDeoTransfersUseCase } from '../use-cases/deo/get-deo-transfers';

export interface DeoApplicationServiceDeps {
  getDashboard: GetDeoDashboardUseCase;
  resolveAlert: ResolveDistrictAlertUseCase;
  listSchools: GetDeoSchoolsUseCase;
  listSchoolAdmins: GetDeoSchoolAdminsUseCase;
  listTeachers: GetDeoTeachersUseCase;
  listStudents: GetDeoStudentsUseCase;
  listTransfers: GetDeoTransfersUseCase;
}

/** Everything the DEO (district) portal asks of the application layer. */
export class DeoApplicationService {
  constructor(private readonly deps: DeoApplicationServiceDeps) {}

  getDashboard(): Promise<ApplicationResponse<DeoDashboardResult>> {
    return this.deps.getDashboard.execute({});
  }

  listSchools(): Promise<ApplicationResponse<DeoSchoolsResult>> {
    return this.deps.listSchools.execute({});
  }

  listSchoolAdmins(): Promise<ApplicationResponse<DeoSchoolAdminsResult>> {
    return this.deps.listSchoolAdmins.execute({});
  }

  listTeachers(): Promise<ApplicationResponse<DeoTeachersResult>> {
    return this.deps.listTeachers.execute({});
  }

  listStudents(): Promise<ApplicationResponse<DeoStudentsResult>> {
    return this.deps.listStudents.execute({});
  }

  listTransfers(): Promise<ApplicationResponse<DeoTransfersResult>> {
    return this.deps.listTransfers.execute({});
  }

  resolveAlert(alertId: string): Promise<ApplicationResponse<boolean>> {
    return this.deps.resolveAlert.execute({ alertId });
  }
}
