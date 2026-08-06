'use client';

import { usePresentation } from '../presentation-provider';

/** ViewModel selectors owned by the Teacher portal. Attendance recording
 * uses the shared hook (see lib/presentation/hooks/shared.ts) since it's the
 * same ViewModel the school-admin attendance report reads. */
export const useTeacherDashboardViewModel = () => usePresentation().viewModels.teacherDashboard;
export const useAssignmentsViewModel = () => usePresentation().viewModels.assignments;
