import { IpcChannels } from '@nemis-desktop/types';
import type { ReportCardsApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const reportCardsApi: ReportCardsApi = {
  listForStudent: (studentId) => invoke(IpcChannels.REPORT_CARDS_LIST_FOR_STUDENT, studentId),
  listForClass: (classId) => invoke(IpcChannels.REPORT_CARDS_LIST_FOR_CLASS, classId),
  getIssue: (issueId) => invoke(IpcChannels.REPORT_CARD_GET_ISSUE, issueId),
  listArchivedYears: () => invoke(IpcChannels.REPORT_CARDS_LIST_ARCHIVED_YEARS),
};
