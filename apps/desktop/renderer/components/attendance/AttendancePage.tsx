'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AttendanceStatus, type AttendanceStatus as AttendanceStatusValue } from '@nemis-desktop/types';
import { Alert, EmptyState, ErrorState, Skeleton } from '@nemis-desktop/ui';
import { formatNemisId } from '@nemis-desktop/shared';
import {
  Save,
  Lock,
  Pencil,
  ChevronLeft,
  ChevronRight,
  CheckCheck,
  Calendar,
  BookOpen,
  GraduationCap,
} from 'lucide-react';
import { useViewModel } from '@/hooks/use-view-model';
import { hasData } from '@nemis-desktop/presentation';
import { useCurrentUserViewModel, useAttendanceViewModel } from '@/lib/presentation/hooks/shared';
import { useStudentsViewModel, useTeachingAssignmentViewModel } from '@/lib/presentation/hooks/school-admin';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { DatabaseUnavailablePanel } from '@/components/dashboard/DatabaseUnavailablePanel';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

interface ClassOption {
  classId: string;
  className: string;
  section?: string;
  subjects: { id: string; name: string }[];
}

/** The four states a teacher can quick-mark. Mirrors portal-web's row of
 * P/A/L/E buttons; SICK stays readable (an existing record renders its own
 * label) but isn't offered as a quick mark, exactly as on the web client. */
const QUICK_MARK_STATUSES: AttendanceStatusValue[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.ABSENT,
  AttendanceStatus.LATE,
  AttendanceStatus.EXCUSED,
];

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-pink-500',
  'bg-indigo-500',
];

function getAvatarColor(name: string): string {
  if (!name) return 'bg-slate-500';
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length] ?? 'bg-slate-500';
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function statusLabel(status: AttendanceStatusValue): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatDateLong(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0]!;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Monday-first offset (0 = Mon … 6 = Sun)
function firstDayOffset(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Teacher-facing attendance recording, scoped to one class + one subject the
 * teacher is actually assigned to teach there. Layout and styling mirror
 * portal-web's /government/teacher/attendance one-for-one so the desktop and
 * web clients read as the same product; only the data plumbing differs
 * (local ViewModels/SQLite here, RTK Query there). School admins get a
 * separate, view-only report (AttendanceReportPage) — recording stays
 * exclusive to teachers. */
export function AttendancePage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const currentUser = useCurrentUserViewModel();
  const teachingAssignments = useTeachingAssignmentViewModel();
  const students = useStudentsViewModel();
  const attendance = useAttendanceViewModel();

  const user = useViewModel(currentUser.store, (s) => s.user);
  const assignments = useViewModel(teachingAssignments.store, (s) => s.assignments);
  const studentList = useViewModel(students.store, (s) => s.list);
  const records = useViewModel(attendance.store, (s) => s.records);

  const teacherId = user.status === 'success' ? user.data.id : undefined;

  // The signed-in identity (`teacherId`, the `users` table) and the id every
  // teaching-assignment record is keyed by (`staff.id`) are different id
  // spaces — `staff.userId` is the (unique) bridge between them. Mirrors
  // government/teacher/page.tsx. `teacherId` itself stays in use for
  // `recordedBy` below, which is the signed-in user, not the staff record.
  const [staffId, setStaffId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!teacherId) return;
    let cancelled = false;
    void sharedBridge.listSchoolAdminRecords({ collection: 'staff', limit: 250 }).then((result) => {
      if (cancelled) return;
      const mine = result.items.find((r) => r.userId === teacherId);
      setStaffId(mine ? String(mine.id) : undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [teacherId]);

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState(today);
  const [draftStatus, setDraftStatus] = useState<Record<string, AttendanceStatusValue>>({});
  const [draftRemarks, setDraftRemarks] = useState<Record<string, string>>({});
  const [isLocked, setIsLocked] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [updateReason, setUpdateReason] = useState('');
  const [pendingUpdateReason, setPendingUpdateReason] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());

  const calRef = useRef<HTMLDivElement>(null);

  useRevalidateOnSync(() => {
    if (staffId) void teachingAssignments.load(staffId);
  }, [staffId, teachingAssignments]);

  const assignmentsLoaded =
    assignments.status === 'success' || assignments.status === 'refreshing' || assignments.status === 'empty';

  // Only subjects actually assigned to this teacher for the class (via
  // ClassSubjectTeacher) — a plain homeroom (ClassTeacher-only) assignment
  // with no subject isn't something the teacher can mark attendance for.
  const myClasses = useMemo<ClassOption[]>(() => {
    if (!hasData(assignments)) return [];
    const byClass = new Map<string, ClassOption>();
    for (const a of assignments.data) {
      if (!a.subjectId || !a.subjectName) continue;
      const existing = byClass.get(a.classId);
      if (existing) {
        if (!existing.subjects.some((s) => s.id === a.subjectId)) {
          existing.subjects.push({ id: a.subjectId, name: a.subjectName });
        }
      } else {
        byClass.set(a.classId, {
          classId: a.classId,
          className: a.className,
          section: a.section,
          subjects: [{ id: a.subjectId, name: a.subjectName }],
        });
      }
    }
    return Array.from(byClass.values());
  }, [assignments]);

  const selectedClass = myClasses.find((c) => c.classId === classId);

  // Auto-select the first class + its first subject once assignments load.
  useEffect(() => {
    if (!classId && myClasses.length > 0) {
      const first = myClasses[0]!;
      setClassId(first.classId);
      setSubjectId(first.subjects[0]?.id ?? '');
    }
  }, [classId, myClasses]);

  function handleSelectClass(newClassId: string) {
    setClassId(newClassId);
    const cls = myClasses.find((c) => c.classId === newClassId);
    setSubjectId(cls?.subjects[0]?.id ?? '');
  }

  useEffect(() => {
    if (!classId) return;
    students.setFilters({ classId, isActive: true, sort: 'name' });
    void students.loadStudents();
  }, [classId, students]);

  useEffect(() => {
    if (!classId || !subjectId) return;
    void attendance.loadAttendance(classId, date, subjectId);
  }, [classId, subjectId, date, attendance]);

  // Close the calendar popover on an outside click.
  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node)) {
        setShowCalendar(false);
      }
    }
    if (showCalendar) document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [showCalendar]);

  // Reset transient UI state and (re)populate the draft whenever the
  // selection or its data changes — existing records lock the form;
  // no records yet seeds every roster student as Present.
  useEffect(() => {
    setUpdateReason('');
    setPendingUpdateReason(undefined);
    setShowReasonModal(false);
    setSuccessMessage('');
    setErrorMessage('');

    if (!classId || !subjectId) {
      setDraftStatus({});
      setDraftRemarks({});
      setIsLocked(false);
      return;
    }

    if (records.status === 'success' || records.status === 'refreshing') {
      setDraftStatus(
        Object.fromEntries(
          records.data.map((r) => [r.studentId, r.status.label.toUpperCase() as AttendanceStatusValue]),
        ),
      );
      setDraftRemarks(Object.fromEntries(records.data.map((r) => [r.studentId, r.remarks ?? ''])));
      setIsLocked(true);
    } else if (records.status === 'empty' && hasData(studentList)) {
      setDraftStatus(Object.fromEntries(studentList.data.map((s) => [s.id, AttendanceStatus.PRESENT])));
      setDraftRemarks({});
      setIsLocked(false);
    }
  }, [classId, subjectId, date, records, studentList]);

  function handleStatusChange(studentId: string, status: AttendanceStatusValue) {
    if (isLocked) return;
    setDraftStatus((prev) => ({ ...prev, [studentId]: status }));
  }

  function handleRemarksChange(studentId: string, remarks: string) {
    if (isLocked) return;
    setDraftRemarks((prev) => ({ ...prev, [studentId]: remarks }));
  }

  function handleMarkAllPresent() {
    if (isLocked || !hasData(studentList)) return;
    setDraftStatus(Object.fromEntries(studentList.data.map((s) => [s.id, AttendanceStatus.PRESENT])));
  }

  function handleUpdateClick() {
    if (date === today) {
      setIsLocked(false);
    } else {
      setShowReasonModal(true);
    }
  }

  function handleConfirmUnlock() {
    if (!updateReason.trim()) return;
    setIsLocked(false);
    setPendingUpdateReason(updateReason);
    setShowReasonModal(false);
  }

  async function handleSave() {
    if (!classId || !subjectId || !hasData(studentList)) return;
    setSuccessMessage('');
    setErrorMessage('');
    setIsSaving(true);
    for (const student of studentList.data) {
      const outcome = await attendance.recordAttendance({
        studentId: student.id,
        classId,
        subjectId,
        date,
        status: draftStatus[student.id] ?? AttendanceStatus.PRESENT,
        remarks: draftRemarks[student.id]?.trim() || undefined,
        recordedBy: teacherId,
        updateReason: pendingUpdateReason,
      });
      if (!outcome.ok) {
        setErrorMessage(outcome.error.userMessage);
        setIsSaving(false);
        return;
      }
    }
    setIsSaving(false);
    setSuccessMessage('Attendance saved successfully.');
    setIsLocked(true);
    setPendingUpdateReason(undefined);
    setUpdateReason('');
  }

  const selectedSubjectName = selectedClass?.subjects.find((s) => s.id === subjectId)?.name ?? '';
  const selectedClassLabel = selectedClass
    ? selectedClass.section
      ? `${selectedClass.className} — ${selectedClass.section}`
      : selectedClass.className
    : '';

  const summary = useMemo(() => {
    const statuses = Object.values(draftStatus);
    return {
      present: statuses.filter((s) => s === AttendanceStatus.PRESENT).length,
      absent: statuses.filter((s) => s === AttendanceStatus.ABSENT).length,
      late: statuses.filter((s) => s === AttendanceStatus.LATE).length,
      excused: statuses.filter((s) => s === AttendanceStatus.EXCUSED).length,
      total: statuses.length,
    };
  }, [draftStatus]);

  const hasRecordedAttendance = records.status === 'success' || records.status === 'refreshing';
  const isLoading = studentList.status === 'loading' || records.status === 'loading';

  if (assignments.status === 'error' && assignments.error.kind === 'database-unavailable') {
    return (
      <div className="p-6">
        <DatabaseUnavailablePanel onRetry={() => staffId && void teachingAssignments.load(staffId)} />
      </div>
    );
  }
  if (assignments.status === 'error') {
    return (
      <div className="p-6">
        <ErrorState
          message={assignments.error.userMessage}
          onRetry={() => staffId && void teachingAssignments.load(staffId)}
        />
      </div>
    );
  }
  if (!assignmentsLoaded) {
    return (
      <div className="p-6">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (myClasses.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          title="No subjects assigned"
          description="You have not been assigned to teach any subject in a class yet. Contact your school administrator."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── SIDEBAR ── */}
      <aside className="w-[210px] bg-slate-100 border-r border-slate-200 flex flex-col overflow-y-auto flex-shrink-0 pb-4">
        <div className="px-3.5 pt-4 pb-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
          Classes
        </div>

        {myClasses.map((cls) => (
          <div key={cls.classId}>
            <button
              onClick={() => handleSelectClass(cls.classId)}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-md border-l-[3px] transition-colors text-left ${
                classId === cls.classId
                  ? 'bg-white text-slate-600 font-bold border-secondary shadow-sm'
                  : 'text-slate-600 border-transparent hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <GraduationCap size={14} className="flex-shrink-0" />
              <span className="flex-1 truncate">
                {cls.section ? `${cls.className} — ${cls.section}` : cls.className}
              </span>
              {/* Only the selected class has a loaded roster — the local
                  teaching-assignment records carry no enrollment count, so the
                  badge appears once the count is actually known. */}
              {classId === cls.classId && hasData(studentList) && (
                <span className="bg-slate-200 text-slate-500 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {studentList.data.length}
                </span>
              )}
            </button>

            {classId === cls.classId &&
              cls.subjects.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setSubjectId(sub.id)}
                  className={`w-full flex items-center gap-2 pl-8 pr-3.5 py-2 text-sm border-l-[3px] transition-colors text-left ${
                    subjectId === sub.id
                      ? 'bg-secondary/20 text-secondary font-bold border-secondary'
                      : 'text-slate-500 border-transparent hover:bg-slate-200 hover:text-slate-700'
                  }`}
                >
                  <BookOpen size={12} className="flex-shrink-0" />
                  <span className="flex-1 truncate">{sub.name}</span>
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      hasRecordedAttendance && subjectId === sub.id ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  />
                </button>
              ))}
          </div>
        ))}
      </aside>

      {/* ── MAIN ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
        {/* Toolbar */}
        <div className="bg-white border-b border-slate-200 h-[62px] flex items-center gap-3 px-6 flex-shrink-0 relative">
          <span className="text-md font-bold text-slate-500 truncate">
            {selectedSubjectName || 'Select a subject'}
          </span>

          {selectedClass && (
            <span className="text-md text-slate-500 truncate">
              {selectedClassLabel}
              {hasData(studentList) && ` — ${studentList.data.length} students`}
            </span>
          )}

          <div className="w-px h-5 bg-slate-200 mx-1 flex-shrink-0" />

          {/* Date navigation */}
          <button
            onClick={() => setDate((d) => shiftDate(d, -1))}
            className="w-[30px] h-[30px] border border-slate-200 rounded-lg flex items-center justify-center text-slate-500 hover:border-slate-400 transition-colors flex-shrink-0"
            title="Previous day"
          >
            <ChevronLeft size={14} />
          </button>

          <div className="relative flex-shrink-0" ref={calRef}>
            <button
              onClick={() => setShowCalendar((v) => !v)}
              className="flex items-center gap-1.5 px-3 h-[30px] border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-600 transition-colors whitespace-nowrap"
            >
              <Calendar size={13} />
              {formatDateLong(date)}
            </button>

            {showCalendar && (
              <div className="absolute top-[38px] left-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3.5 w-[232px]">
                <div className="flex items-center gap-2 mb-2.5">
                  <button
                    onClick={() => {
                      if (calMonth === 0) {
                        setCalMonth(11);
                        setCalYear((y) => y - 1);
                      } else {
                        setCalMonth((m) => m - 1);
                      }
                    }}
                    className="w-[26px] h-[26px] border border-slate-200 rounded-md flex items-center justify-center text-slate-500 hover:border-slate-400 bg-slate-50"
                  >
                    <ChevronLeft size={11} />
                  </button>
                  <span className="flex-1 text-center text-xs font-bold text-slate-900">
                    {new Date(calYear, calMonth).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  <button
                    onClick={() => {
                      if (calMonth === 11) {
                        setCalMonth(0);
                        setCalYear((y) => y + 1);
                      } else {
                        setCalMonth((m) => m + 1);
                      }
                    }}
                    className="w-[26px] h-[26px] border border-slate-200 rounded-md flex items-center justify-center text-slate-500 hover:border-slate-400 bg-slate-50"
                  >
                    <ChevronRight size={11} />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-0.5 text-center">
                  {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
                    <div key={d} className="text-[9px] font-bold text-slate-400 py-1">
                      {d}
                    </div>
                  ))}

                  {Array.from({ length: firstDayOffset(calYear, calMonth) }).map((_, i) => (
                    <div key={`blank-${i}`} />
                  ))}

                  {Array.from({ length: daysInMonth(calYear, calMonth) }, (_, i) => i + 1).map((day) => {
                    const iso = toIso(calYear, calMonth, day);
                    const isToday = iso === today;
                    const isSelected = iso === date;
                    return (
                      <button
                        key={day}
                        onClick={() => {
                          setDate(iso);
                          setShowCalendar(false);
                        }}
                        className={`text-[11px] py-1 rounded-md transition-colors w-full ${
                          isSelected
                            ? 'bg-[#1e293b] text-white font-bold rounded-full'
                            : isToday
                              ? 'text-blue-600 font-bold hover:bg-slate-100'
                              : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 flex items-center gap-1.5 text-[9px] text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  Attendance recorded
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setDate((d) => shiftDate(d, 1))}
            className="w-[30px] h-[30px] border border-slate-200 rounded-lg flex items-center justify-center text-slate-500 hover:border-slate-400 transition-colors flex-shrink-0"
            title="Next day"
          >
            <ChevronRight size={14} />
          </button>

          <div className="flex-1" />

          {isLocked && (
            <button
              onClick={handleUpdateClick}
              className="flex items-center gap-1.5 px-3.5 h-8 border border-orange-400 rounded-lg text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 transition-colors flex-shrink-0"
            >
              <Pencil size={13} />
              Update Attendance
            </button>
          )}
        </div>

        {/* Locked banner */}
        {isLocked && (
          <div className="mx-6 mt-3 flex items-center gap-2.5 bg-secondary/5 border border-secondary/5 px-3.5 py-2.5 text-sm text-slate-500 flex-shrink-0">
            <Lock size={14} className="flex-shrink-0" />
            <span>
              <strong>Attendance submitted.</strong> This record is locked. Click <em>Update Attendance</em> to
              make changes.
            </span>
          </div>
        )}

        {/* Alerts */}
        {(successMessage || errorMessage) && (
          <div className="px-6 pt-3 space-y-2 flex-shrink-0">
            {successMessage && <Alert variant="success">{successMessage}</Alert>}
            {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
          </div>
        )}

        {/* Stats bar */}
        <div className="bg-white border-b border-slate-200 px-6 h-12 flex items-center gap-6 flex-shrink-0 mt-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-emerald-600">{summary.present}</span>
            <span className="text-[12px] font-bold text-emerald-600">Present</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-red-600">{summary.absent}</span>
            <span className="text-[11px] font-semibold text-red-600">Absent</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-amber-600">{summary.late}</span>
            <span className="text-[12px] font-bold text-amber-600">Late</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-blue-700">{summary.excused}</span>
            <span className="text-[12px] font-bold text-blue-700">Excused</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-slate-500">{summary.total}</span>
            <span className="text-[12px] font-bold text-slate-500">Total</span>
          </div>
          <div className="flex-1" />
          <button
            onClick={handleMarkAllPresent}
            disabled={isLocked}
            className="flex items-center gap-1.5 px-3 h-[30px] bg-slate-50 border border-slate-300  text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <CheckCheck size={13} />
            Mark All Present
          </button>
        </div>

        {/* Table area */}
        {!subjectId ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            Select a class and subject to mark attendance
          </div>
        ) : isLoading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : studentList.status === 'error' ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <ErrorState message={studentList.error.userMessage} />
          </div>
        ) : !hasData(studentList) || studentList.data.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            No students found in this class
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <table className="w-full bg-white rounded-lg overflow-hidden shadow-sm border border-slate-100">
              <thead className="bg-secondary/20">
                <tr>
                  <th className="text-left text-xs font-bold text-slate-400 uppercase tracking-wide px-4 py-3">
                    Student
                  </th>
                  <th className="text-center text-xs font-bold text-slate-400 uppercase tracking-wide px-4 py-3">
                    Status
                  </th>
                  <th className="text-center text-xs font-bold text-slate-400 uppercase tracking-wide px-4 py-3">
                    Quick Mark
                  </th>
                  <th className="text-left text-xs font-bold text-slate-400 uppercase tracking-wide px-4 py-3">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentList.data.map((student) => {
                  const { firstName, lastName } = splitName(student.fullName);
                  const initials = getInitials(firstName, lastName);
                  const color = getAvatarColor(firstName);
                  const status = draftStatus[student.id] ?? AttendanceStatus.PRESENT;
                  return (
                    <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0`}
                          >
                            {initials}
                          </div>
                          <div>
                            <div className="text-md font-bold text-slate-500">{student.fullName}</div>
                            <div className="text-[12px] text-slate-400">{student.nemisId ? formatNemisId(student.nemisId) : '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center border border-slate-200 bg-slate-50 gap-1.5 px-2.5 py-1  text-[14px] font-semibold ${
                            status === AttendanceStatus.PRESENT
                              ? ' text-emerald-700'
                              : status === AttendanceStatus.ABSENT
                                ? ' text-red-700'
                                : status === AttendanceStatus.LATE
                                  ? ' text-amber-500'
                                  : status === AttendanceStatus.EXCUSED
                                    ? 'text-blue-700'
                                    : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <span
                            className={` ${
                              status === AttendanceStatus.PRESENT
                                ? 'bg-emerald-500'
                                : status === AttendanceStatus.ABSENT
                                  ? 'bg-red-500'
                                  : status === AttendanceStatus.LATE
                                    ? 'bg-amber-500'
                                    : status === AttendanceStatus.EXCUSED
                                      ? 'bg-blue-700'
                                      : 'bg-slate-400'
                            }`}
                          />
                          {statusLabel(status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {QUICK_MARK_STATUSES.map((s) => (
                            <button
                              key={s}
                              onClick={() => handleStatusChange(student.id, s)}
                              disabled={isLocked}
                              aria-label={`Mark ${student.fullName} ${statusLabel(s)}`}
                              className={`w-8 h-8 text-[14px] font-bold border transition-all ${
                                status === s
                                  ? s === AttendanceStatus.PRESENT
                                    ? 'bg-emerald-500 text-white border-emerald-600 '
                                    : s === AttendanceStatus.ABSENT
                                      ? 'bg-red-500 text-white border-red-600 '
                                      : s === AttendanceStatus.EXCUSED
                                        ? 'bg-blue-500 text-white border-blue-600 '
                                        : 'bg-amber-500 text-white border-amber-600 '
                                  : 'bg-slate-100 text-slate-500 border-transparent hover:bg-slate-200'
                              } disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                              {s.charAt(0)}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={draftRemarks[student.id] ?? ''}
                          onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                          disabled={isLocked}
                          aria-label={`Remarks for ${student.fullName}`}
                          placeholder="Optional note..."
                          className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400 transition-colors"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer — save button */}
        {!isLocked && subjectId && hasData(studentList) && studentList.data.length > 0 && (
          <div className="bg-white border-t border-slate-200 px-6 py-3 flex-shrink-0">
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="w-full h-11 bg-primary hover:bg-primary-400 text-white rounded-button text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={15} />
              {isSaving ? 'Saving...' : `Save Attendance — ${selectedSubjectName} · ${selectedClassLabel}`}
            </button>
          </div>
        )}
      </div>

      {/* ── REASON MODAL ── */}
      {showReasonModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-[380px] p-6">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center mb-3.5">
              <Pencil size={18} className="text-orange-500" />
            </div>
            <h3 className="text-[15px] font-bold text-slate-900 mb-1.5">Update Past Attendance</h3>
            <p className="text-xs text-slate-500 mb-3.5 leading-relaxed">
              You are modifying attendance for{' '}
              <strong>
                {selectedSubjectName} &mdash; {selectedClassLabel}
              </strong>{' '}
              on <strong>{formatDateLong(date)}</strong>. Provide a reason — it will be saved as part of the
              audit trail.
            </p>
            <label
              htmlFor="attendance-update-reason"
              className="block text-[11px] font-semibold text-slate-700 mb-1.5"
            >
              Reason for update
            </label>
            <textarea
              id="attendance-update-reason"
              value={updateReason}
              onChange={(e) => setUpdateReason(e.target.value)}
              placeholder="e.g. Correcting an error — student was present but marked absent due to a register mix-up."
              className="w-full border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 resize-none h-20 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => setShowReasonModal(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-xs text-slate-500 font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUnlock}
                disabled={!updateReason.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Lock size={12} />
                Unlock &amp; Edit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
