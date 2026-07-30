'use client';

import { usePresentation } from '../presentation-provider';

/** ViewModel selectors owned by the Institution Admin (school admin) portal:
 * dashboard, school settings, students, academic foundation, staff
 * directory, and timetable authoring. */
export const useDashboardViewModel = () => usePresentation().viewModels.dashboard;
export const useSettingsViewModel = () => usePresentation().viewModels.settings;
export const useStudentStatisticsViewModel = () => usePresentation().viewModels.studentStatistics;
export const useStudentsViewModel = () => usePresentation().viewModels.students;
export const useStudentsListViewModel = () => usePresentation().viewModels.studentsList;
export const useStudentProfileViewModel = () => usePresentation().viewModels.studentProfile;
export const useEnrollmentViewModel = () => usePresentation().viewModels.enrollment;
export const useStudentSearchViewModel = () => usePresentation().viewModels.studentSearch;
export const useAcademicYearViewModel = () => usePresentation().viewModels.academicYear;
export const useAcademicFoundationViewModel = () => usePresentation().viewModels.academicFoundation;
export const useTeachersListViewModel = () => usePresentation().viewModels.teachersList;
export const useTeacherProfileViewModel = () => usePresentation().viewModels.teacherProfile;
export const useTeacherSearchViewModel = () => usePresentation().viewModels.teacherSearch;
export const useTeachingAssignmentViewModel = () => usePresentation().viewModels.teachingAssignments;
export const useTimetableViewModel = () => usePresentation().viewModels.timetable;
export const useTeacherScheduleViewModel = () => usePresentation().viewModels.teacherSchedule;
export const useClassScheduleViewModel = () => usePresentation().viewModels.classSchedule;
export const useSubjectScheduleViewModel = () => usePresentation().viewModels.subjectSchedule;
export const useTimetableConflictViewModel = () => usePresentation().viewModels.timetableConflicts;
export const useTimetableDashboardViewModel = () => usePresentation().viewModels.timetableDashboard;
export const useClassRosterViewModel = () => usePresentation().viewModels.classRoster;
