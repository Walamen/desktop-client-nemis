import type {
  RegisterSchoolsRequest,
  RegisterSchoolsResult,
  ResubmitSchoolRegistrationRequest,
  SchoolRegistration,
  SchoolRegistrationContext,
  CountyStudentDetail,
  CountyStudentsQuery,
  CountyStudentsResult,
  CountyGuardianDetail,
  CountyGuardiansQuery,
  CountyGuardiansResult,
  CountyTeacherDetail,
  CountyTeachersQuery,
  CountyTeachersResult,
  CountyUserOptions,
  CountyUsersQuery,
  CountyUsersResult,
} from '@nemis-desktop/types';
import type { ApplicationResponse } from '../core/response';
import type { CountyDashboardOutput } from '../dto/county/county-dashboard-dto';
import type { CountyDistrictDetailOutput, CountyDistrictsOutput } from '../dto/county/county-districts-dto';
import type { CountySchoolDetailOutput, CountySchoolsOutput } from '../dto/county/county-schools-dto';
import type { GetCountyDashboardUseCase } from '../use-cases/county/get-county-dashboard';
import type { GetCountyDistrictsUseCase } from '../use-cases/county/get-county-districts';
import type { GetCountyDistrictDetailUseCase } from '../use-cases/county/get-county-district-detail';
import type { GetCountySchoolsUseCase } from '../use-cases/county/get-county-schools';
import type { GetCountySchoolDetailUseCase } from '../use-cases/county/get-county-school-detail';
import type { GetSchoolRegistrationContextUseCase } from '../use-cases/county/get-school-registration-context';
import type { RegisterSchoolsUseCase } from '../use-cases/county/register-schools';
import type { ResubmitSchoolRegistrationUseCase } from '../use-cases/county/resubmit-school-registration';
import type { DiscardSchoolRegistrationUseCase } from '../use-cases/county/discard-school-registration';
import type { GetSchoolRegistrationsUseCase } from '../use-cases/county/get-school-registrations';
import type { GetCountyStudentsUseCase } from '../use-cases/county/get-county-students';
import type { GetCountyStudentDetailUseCase } from '../use-cases/county/get-county-student-detail';
import type { GetCountyGuardiansUseCase } from '../use-cases/county/get-county-guardians';
import type { GetCountyGuardianDetailUseCase } from '../use-cases/county/get-county-guardian-detail';
import type { GetCountyTeachersUseCase } from '../use-cases/county/get-county-teachers';
import type { GetCountyTeacherDetailUseCase } from '../use-cases/county/get-county-teacher-detail';
import type { GetCountyUsersUseCase } from '../use-cases/county/get-county-users';
import type { GetCountyUserOptionsUseCase } from '../use-cases/county/get-county-user-options';

export interface CountyApplicationServiceDeps {
  getDashboard: GetCountyDashboardUseCase;
  listDistricts: GetCountyDistrictsUseCase;
  getDistrict: GetCountyDistrictDetailUseCase;
  listSchools: GetCountySchoolsUseCase;
  getSchool: GetCountySchoolDetailUseCase;
  getRegistrationContext: GetSchoolRegistrationContextUseCase;
  registerSchools: RegisterSchoolsUseCase;
  resubmitSchoolRegistration: ResubmitSchoolRegistrationUseCase;
  discardSchoolRegistration: DiscardSchoolRegistrationUseCase;
  getSchoolRegistrations: GetSchoolRegistrationsUseCase;
  listStudents: GetCountyStudentsUseCase;
  getStudent: GetCountyStudentDetailUseCase;
  listGuardians: GetCountyGuardiansUseCase;
  getGuardian: GetCountyGuardianDetailUseCase;
  listTeachers: GetCountyTeachersUseCase;
  getTeacher: GetCountyTeacherDetailUseCase;
  listUsers: GetCountyUsersUseCase;
  getUserOptions: GetCountyUserOptionsUseCase;
}

/** The County (CEO) portal's application service. */
export class CountyApplicationService {
  constructor(private readonly deps: CountyApplicationServiceDeps) {}
  getDashboard(): Promise<ApplicationResponse<CountyDashboardOutput>> {
    return this.deps.getDashboard.execute({});
  }
  listDistricts(): Promise<ApplicationResponse<CountyDistrictsOutput>> {
    return this.deps.listDistricts.execute({});
  }
  getDistrict(districtId: string): Promise<ApplicationResponse<CountyDistrictDetailOutput>> {
    return this.deps.getDistrict.execute({ districtId });
  }
  listSchools(): Promise<ApplicationResponse<CountySchoolsOutput>> {
    return this.deps.listSchools.execute({});
  }
  getSchool(schoolId: string): Promise<ApplicationResponse<CountySchoolDetailOutput>> {
    return this.deps.getSchool.execute({ schoolId });
  }
  getRegistrationContext(): Promise<ApplicationResponse<SchoolRegistrationContext>> {
    return this.deps.getRegistrationContext.execute({});
  }
  registerSchools(req: RegisterSchoolsRequest): Promise<ApplicationResponse<RegisterSchoolsResult>> {
    return this.deps.registerSchools.execute(req);
  }
  resubmitSchoolRegistration(req: ResubmitSchoolRegistrationRequest): Promise<ApplicationResponse<RegisterSchoolsResult>> {
    return this.deps.resubmitSchoolRegistration.execute(req);
  }
  discardSchoolRegistration(id: string): Promise<ApplicationResponse<{ discarded: boolean }>> {
    return this.deps.discardSchoolRegistration.execute({ id });
  }
  getSchoolRegistrations(ids: string[]): Promise<ApplicationResponse<SchoolRegistration[]>> {
    return this.deps.getSchoolRegistrations.execute({ ids });
  }
  listStudents(query: CountyStudentsQuery): Promise<ApplicationResponse<CountyStudentsResult>> {
    return this.deps.listStudents.execute(query);
  }
  getStudent(studentId: string): Promise<ApplicationResponse<CountyStudentDetail | null>> {
    return this.deps.getStudent.execute({ studentId });
  }
  listGuardians(query: CountyGuardiansQuery): Promise<ApplicationResponse<CountyGuardiansResult>> {
    return this.deps.listGuardians.execute(query);
  }
  getGuardian(guardianId: string): Promise<ApplicationResponse<CountyGuardianDetail | null>> {
    return this.deps.getGuardian.execute({ guardianId });
  }
  listTeachers(query: CountyTeachersQuery): Promise<ApplicationResponse<CountyTeachersResult>> {
    return this.deps.listTeachers.execute(query);
  }
  getTeacher(teacherId: string): Promise<ApplicationResponse<CountyTeacherDetail | null>> {
    return this.deps.getTeacher.execute({ teacherId });
  }
  listUsers(query: CountyUsersQuery): Promise<ApplicationResponse<CountyUsersResult>> {
    return this.deps.listUsers.execute(query);
  }
  getUserOptions(): Promise<ApplicationResponse<CountyUserOptions>> {
    return this.deps.getUserOptions.execute({});
  }
}
