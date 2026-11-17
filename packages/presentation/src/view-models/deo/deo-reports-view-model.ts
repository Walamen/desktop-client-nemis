import type { DeoApplicationService } from '@nemis-desktop/application';
import type {
  CountyAcademicReport,
  CountyAttendancePeriod,
  CountyAttendanceReport,
  CountyEnrollmentReport,
  CountyStaffComplianceReport,
  DeoReportQuery,
  DeoReportScope,
} from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export type DeoReportType = 'ENROLLMENT' | 'ATTENDANCE' | 'ACADEMIC' | 'STAFF_COMPLIANCE';

export interface DeoReportsState {
  /** Header, export letterhead and the School filter. */
  readonly scope: AsyncState<DeoReportScope>;
  readonly enrollment: AsyncState<CountyEnrollmentReport>;
  readonly attendance: AsyncState<CountyAttendanceReport>;
  readonly academic: AsyncState<CountyAcademicReport>;
  readonly staff: AsyncState<CountyStaffComplianceReport>;
}

export interface DeoReportsViewModelDeps {
  readonly deo: DeoApplicationService;
}

/** DEO Generate Reports. Each report loads only when chosen; the district is
 * the session's, so a query carries at most a school. */
export class DeoReportsViewModel {
  readonly store = createStore<DeoReportsState>(() => ({
    scope: idleState(),
    enrollment: idleState(),
    attendance: idleState(),
    academic: idleState(),
    staff: idleState(),
  }));

  constructor(private readonly deps: DeoReportsViewModelDeps) {}

  async loadScope(): Promise<void> {
    await trackQuery({
      access: { get: () => this.store.getState().scope, set: (scope) => this.store.setState({ scope }) },
      fetch: () => this.deps.deo.getReportScope(),
      map: (result) => result,
    });
  }

  /** The period is used only by the Attendance report. */
  async loadReport(type: DeoReportType, query: DeoReportQuery, period: CountyAttendancePeriod): Promise<void> {
    const { deo } = this.deps;
    if (type === 'ENROLLMENT') {
      await trackQuery({
        access: { get: () => this.store.getState().enrollment, set: (enrollment) => this.store.setState({ enrollment }) },
        fetch: () => deo.getEnrollmentReport(query),
        map: (result) => result,
      });
    } else if (type === 'ATTENDANCE') {
      await trackQuery({
        access: { get: () => this.store.getState().attendance, set: (attendance) => this.store.setState({ attendance }) },
        fetch: () => deo.getAttendanceReport({ ...query, period }),
        map: (result) => result,
      });
    } else if (type === 'ACADEMIC') {
      await trackQuery({
        access: { get: () => this.store.getState().academic, set: (academic) => this.store.setState({ academic }) },
        fetch: () => deo.getAcademicReport(query),
        map: (result) => result,
      });
    } else {
      await trackQuery({
        access: { get: () => this.store.getState().staff, set: (staff) => this.store.setState({ staff }) },
        fetch: () => deo.getStaffComplianceReport(query),
        map: (result) => result,
      });
    }
  }
}
