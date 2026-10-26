import type {
  ReportCardArchivedYear,
  ReportCardClassEntry,
  ReportCardIssueDetail,
  ReportCardSummary,
} from '@nemis-desktop/types';
import { api } from '../api';

/** Report cards (academic-year lifecycle Stage 2), read from the local
 * database for school administrators and teachers. */
export const reportCardsBridge = {
  listReportCardsForStudent: (studentId: string): Promise<ReportCardSummary[]> =>
    api().reportCards.listForStudent(studentId),
  listReportCardsForClass: (classId: string): Promise<ReportCardClassEntry[]> =>
    api().reportCards.listForClass(classId),
  getReportCardIssue: (issueId: string): Promise<ReportCardIssueDetail> =>
    api().reportCards.getIssue(issueId),
  listReportCardArchivedYears: (): Promise<ReportCardArchivedYear[]> =>
    api().reportCards.listArchivedYears(),
};
