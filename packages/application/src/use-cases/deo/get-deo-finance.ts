import type {
  DeoFinanceAuditEntry,
  DeoFinanceFlaggedRow,
  DeoFinanceResult,
  DeoFinanceSchool,
} from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { IDistrictOverviewReadModel } from '../../interfaces/deo/district-overview-read-model';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import {
  financeOutstanding,
  financeRate,
  financeStatus,
  isFinanceFlagged,
  isFinanceListed,
} from './finance-status';

const TREND_MONTHS = 6;
const AUDIT_LIMIT = 50;

export interface GetDeoFinanceDeps {
  readModel: IDistrictOverviewReadModel;
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  clock: IClock;
  logger: IAppLogger;
}

const EMPTY_SUMMARY: DeoFinanceResult['summary'] = {
  totalAllocation: 0,
  totalCollected: 0,
  totalOutstanding: 0,
  complianceRate: 0,
  schoolsBilling: 0,
  schoolsBehind: 0,
};

/** DEO Finance from this device: each active school's current academic year.
 * Rules: docs/superpowers/specs/2026-11-17-deo-finance-design.md; the server
 * builds the same for the web (Nemis districts.service.ts getDistrictFinance). */
export class GetDeoFinanceUseCase implements QueryHandler<Record<string, never>, ApplicationResponse<DeoFinanceResult>> {
  constructor(private readonly deps: GetDeoFinanceDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DeoFinanceResult>> {
    return invokeUseCase('GetDeoFinance', this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) {
        return ok({ districtId: null, district: null, county: null, summary: { ...EMPTY_SUMMARY }, trend: [], schools: [], flagged: [] });
      }
      const { readModel } = this.deps;
      const district = readModel.getDistrict(districtId);
      const county = district ? readModel.getCounty(district.countyId) : null;

      const finance = new Map(readModel.financeBySchool(districtId).map((row) => [row.institutionId, row]));
      const students = new Map(readModel.countActiveStudentsBySchool(districtId).map((row) => [row.institutionId, row.count]));
      const lastPayment = new Map(readModel.lastPaymentBySchool(districtId).map((row) => [row.institutionId, row.paidAt]));
      const adminName = new Map(readModel.schoolAdminNameBySchool(districtId).map((row) => [row.institutionId, row.name]));

      const schools: DeoFinanceSchool[] = readModel.listActiveSchools(districtId).map((school) => {
        const allocation = finance.get(school.id)?.allocation ?? 0;
        const collected = finance.get(school.id)?.collected ?? 0;
        const complianceRate = financeRate(collected, allocation);
        return {
          schoolId: school.id,
          schoolName: school.name,
          schoolCode: school.code,
          principalName: adminName.get(school.id) || school.metadataPrincipal || 'Not recorded',
          allocation,
          collected,
          outstanding: financeOutstanding(allocation, collected),
          complianceRate,
          studentCount: students.get(school.id) ?? 0,
          lastPaymentAt: lastPayment.get(school.id) ?? null,
          status: financeStatus(allocation, complianceRate),
        };
      });
      schools.sort(
        (a, b) =>
          b.complianceRate - a.complianceRate ||
          a.schoolName.localeCompare(b.schoolName) ||
          a.schoolId.localeCompare(b.schoolId),
      );

      const sum = (pick: (school: DeoFinanceSchool) => number) => schools.reduce((total, school) => total + pick(school), 0);
      const totalAllocation = sum((s) => s.allocation);
      const totalCollected = sum((s) => s.collected);

      return ok({
        districtId,
        district: district ? { id: district.id, name: district.name } : null,
        county,
        summary: {
          totalAllocation,
          totalCollected,
          totalOutstanding: sum((s) => s.outstanding),
          complianceRate: financeRate(totalCollected, totalAllocation),
          schoolsBilling: schools.filter((s) => s.allocation > 0).length,
          schoolsBehind: schools.filter((s) => s.status === 'Behind').length,
        },
        trend: this.#trend(districtId),
        schools,
        flagged: flaggedRows(schools),
      });
    });
  }

  /** The last six months including this one, in this machine's calendar. */
  #trend(districtId: string): DeoFinanceResult['trend'] {
    const now = new Date(this.deps.clock.now());
    const months = Array.from({ length: TREND_MONTHS }, (_, index) =>
      new Date(now.getFullYear(), now.getMonth() - (TREND_MONTHS - 1) + index, 1),
    );
    const amounts = new Map(
      this.deps.readModel.paymentsByMonth(districtId, months[0]!.toISOString()).map((row) => [row.month, row.amount]),
    );
    return months.map((month) => ({
      period: month.toLocaleString('en-US', { month: 'short' }),
      amount: Math.round(amounts.get(monthKey(month)) ?? 0),
    }));
  }
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function flaggedRows(schools: DeoFinanceSchool[]): DeoFinanceFlaggedRow[] {
  return schools
    .filter((school) => isFinanceListed(school.allocation, school.collected))
    .map((school) => ({
      schoolId: school.schoolId,
      schoolName: school.schoolName,
      schoolCode: school.schoolCode,
      expected: school.allocation,
      collected: school.collected,
      outstanding: school.outstanding,
      collectionRate: school.complianceRate,
      isFlagged: isFinanceFlagged(school.complianceRate, school.outstanding),
    }))
    .sort((a, b) => a.collectionRate - b.collectionRate || a.schoolName.localeCompare(b.schoolName));
}

export interface GetDeoFinanceAuditDeps {
  readModel: IDistrictOverviewReadModel;
  currentDistrictId: string | null;
  logger: IAppLogger;
}

/** The newest 50 finance audit entries the district snapshot shipped to this device. */
export class GetDeoFinanceAuditUseCase
  implements QueryHandler<Record<string, never>, ApplicationResponse<DeoFinanceAuditEntry[]>>
{
  constructor(private readonly deps: GetDeoFinanceAuditDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DeoFinanceAuditEntry[]>> {
    return invokeUseCase('GetDeoFinanceAudit', this.deps.logger, async () =>
      ok(this.deps.currentDistrictId ? this.deps.readModel.listFinanceAudit(AUDIT_LIMIT) : []),
    );
  }
}
