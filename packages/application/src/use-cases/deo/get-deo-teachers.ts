import type { DeoTeacher, DeoTeachersResult, TeacherGradesStatus } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type {
  DistrictTeacherRow,
  IDistrictOverviewReadModel,
} from '../../interfaces/deo/district-overview-read-model';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetDeoTeachersDeps {
  readModel: IDistrictOverviewReadModel;
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  clock: IClock;
  logger: IAppLogger;
}

const EMPTY_SUMMARY = { totalTeachers: 0, gradesPending: 0, pendingApproval: 0, unassigned: 0 };

/** DEO Teacher Monitoring, from this device. Same rules as the server
 * (districts.service.ts getDistrictTeacherMonitoring); teacher attendance is
 * not recorded anywhere, so there is no attendance figure. */
export class GetDeoTeachersUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<DeoTeachersResult>
> {
  constructor(private readonly deps: GetDeoTeachersDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DeoTeachersResult>> {
    return invokeUseCase('GetDeoTeachers', this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) {
        return ok({ districtId: null, district: null, county: null, teachers: [], summary: EMPTY_SUMMARY });
      }
      const { readModel } = this.deps;
      const district = readModel.getDistrict(districtId);
      const county = district ? readModel.getCounty(district.countyId) : null;
      const teachers = readModel
        .listTeachers(districtId)
        .map(toTeacher)
        .sort(
          (a, b) =>
            a.lastName.localeCompare(b.lastName) ||
            a.firstName.localeCompare(b.firstName) ||
            a.id.localeCompare(b.id),
        );
      return ok({
        districtId,
        district: district ? { id: district.id, name: district.name } : null,
        county,
        teachers,
        summary: {
          totalTeachers: teachers.length,
          gradesPending: teachers.filter((t) => t.gradesStatus === 'Pending').length,
          pendingApproval: teachers.filter((t) => t.pendingApproval).length,
          unassigned: teachers.filter((t) => t.unassigned).length,
        },
      });
    });
  }
}

function toTeacher(row: DistrictTeacherRow): DeoTeacher {
  const gradesStatus: TeacherGradesStatus =
    row.ownedAssessments === 0 ? 'No assessments' : row.ungradedAssessments > 0 ? 'Pending' : 'Submitted';
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    employeeNumber: row.employeeNumber,
    schoolId: row.schoolId,
    schoolName: row.schoolName,
    subjects: row.subjects,
    leadSubject: row.subjects[0] ?? row.firstClassGrade ?? 'General',
    gradesStatus,
    pendingApproval: row.approvalStatus !== 'APPROVED',
    unassigned: row.unassigned,
  };
}
