'use client';

import { useEffect, useMemo, useState } from 'react';
import { AttendanceStatus, type AttendanceStatus as AttendanceStatusValue } from '@nemis-desktop/types';
import {
  Alert, Badge, Button, EmptyState, ErrorState, Input, Modal, Select, Skeleton, Textarea,
} from '@nemis-desktop/ui';
import { Lock, Pencil } from 'lucide-react';
import { useViewModel } from '@/hooks/use-view-model';
import { hasData } from '@nemis-desktop/presentation';
import { useCurrentUserViewModel, useAttendanceViewModel } from '@/lib/presentation/hooks/shared';
import { useStudentsViewModel, useTeachingAssignmentViewModel } from '@/lib/presentation/hooks/school-admin';
import { DatabaseUnavailablePanel } from '@/components/dashboard/DatabaseUnavailablePanel';

interface ClassOption {
  classId: string;
  className: string;
  section?: string;
  subjects: { id: string; name: string }[];
}

const STATUS_OPTIONS = Object.values(AttendanceStatus).map((status) => ({
  value: status,
  label: status.charAt(0) + status.slice(1).toLowerCase(),
}));

const STATUS_BADGE: Record<AttendanceStatusValue, 'success' | 'error' | 'warning' | 'neutral'> = {
  PRESENT: 'success',
  ABSENT: 'error',
  LATE: 'warning',
  EXCUSED: 'neutral',
  SICK: 'neutral',
};

/** Teacher-facing attendance recording, scoped to one class + one subject the
 * teacher is actually assigned to teach there (mirrors portal-web's
 * /government/teacher/attendance). School admins get a separate, view-only
 * report (AttendanceReportPage) — recording stays exclusive to teachers. */
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

  useEffect(() => {
    if (teacherId && assignments.status === 'idle') void teachingAssignments.load(teacherId);
  }, [teacherId, assignments.status, teachingAssignments]);

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

  const classOptions = myClasses.map((c) => ({
    value: c.classId,
    label: c.section ? `${c.className} — ${c.section}` : c.className,
  }));
  const subjectOptions = (selectedClass?.subjects ?? []).map((s) => ({ value: s.id, label: s.name }));
  const selectedSubjectName = selectedClass?.subjects.find((s) => s.id === subjectId)?.name ?? '';

  const summary = useMemo(() => {
    const statuses = Object.values(draftStatus);
    return {
      present: statuses.filter((s) => s === AttendanceStatus.PRESENT).length,
      absent: statuses.filter((s) => s === AttendanceStatus.ABSENT).length,
      late: statuses.filter((s) => s === AttendanceStatus.LATE).length,
      total: statuses.length,
    };
  }, [draftStatus]);

  const isLoadingRoster = studentList.status === 'loading';
  const isLoadingAttendance = records.status === 'loading';

  if (assignments.status === 'error' && assignments.error.kind === 'database-unavailable') {
    return (
      <div className="p-6">
        <DatabaseUnavailablePanel onRetry={() => teacherId && void teachingAssignments.load(teacherId)} />
      </div>
    );
  }
  if (assignments.status === 'error') {
    return (
      <div className="p-6">
        <ErrorState
          message={assignments.error.userMessage}
          onRetry={() => teacherId && void teachingAssignments.load(teacherId)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Attendance</h1>
        <p className="mt-1 text-sm text-slate-500">
          Select a class and one of your assigned subjects to mark attendance.
        </p>
      </div>

      {!assignmentsLoaded ? (
        <Skeleton className="h-24 w-full" />
      ) : myClasses.length === 0 ? (
        <EmptyState
          title="No subjects assigned"
          description="You have not been assigned to teach any subject in a class yet. Contact your school administrator."
        />
      ) : (
        <>
          <div className="grid gap-4 rounded-card border border-slate-200 bg-white p-4 md:grid-cols-3">
            <Select
              label="Class"
              options={classOptions}
              placeholder="Select a class"
              value={classId}
              onChange={(e) => handleSelectClass(e.target.value)}
            />
            <Select
              label="Subject"
              options={subjectOptions}
              placeholder="Select a subject"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              disabled={subjectOptions.length === 0}
            />
            <label className="text-small font-medium text-neutral-dark">
              Date
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                className="mt-2 block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
              />
            </label>
          </div>

          {isLocked && (
            <Alert variant="warning">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Lock size={14} />
                  Attendance submitted for this date. This record is locked.
                </span>
                <Button size="sm" variant="secondary" onClick={handleUpdateClick}>
                  <Pencil size={13} className="mr-1.5" />
                  Update Attendance
                </Button>
              </div>
            </Alert>
          )}

          {successMessage && <Alert variant="success">{successMessage}</Alert>}
          {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

          {!subjectId ? (
            <EmptyState title="Select a subject" description="Choose a subject to mark attendance." />
          ) : isLoadingRoster || isLoadingAttendance ? (
            <Skeleton className="h-56 w-full" />
          ) : studentList.status === 'error' ? (
            <ErrorState message={studentList.error.userMessage} />
          ) : studentList.status === 'empty' ? (
            <EmptyState
              title="No enrolled students"
              description="Enroll students in this class before recording attendance."
            />
          ) : (
            hasData(studentList) && (
              <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center gap-6 border-b border-slate-100 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-700">
                    {selectedSubjectName} — {selectedClass?.className}
                  </span>
                  <div className="flex items-center gap-4 text-xs font-semibold">
                    <span className="text-emerald-600">{summary.present} Present</span>
                    <span className="text-red-600">{summary.absent} Absent</span>
                    <span className="text-amber-600">{summary.late} Late</span>
                    <span className="text-slate-500">{summary.total} Total</span>
                  </div>
                  <div className="flex-1" />
                  <Button size="sm" variant="secondary" disabled={isLocked} onClick={handleMarkAllPresent}>
                    Mark All Present
                  </Button>
                </div>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="p-4">Student</th>
                      <th className="p-4">Student number</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentList.data.map((student) => (
                      <tr key={student.id} className="border-b last:border-0">
                        <td className="p-4 font-medium">{student.fullName}</td>
                        <td className="p-4 font-mono">{student.admissionNumber}</td>
                        <td className="p-4">
                          {isLocked ? (
                            <Badge variant={STATUS_BADGE[draftStatus[student.id] ?? AttendanceStatus.PRESENT]}>
                              {STATUS_OPTIONS.find((o) => o.value === draftStatus[student.id])?.label ?? 'Present'}
                            </Badge>
                          ) : (
                            <Select
                              aria-label={`Attendance for ${student.fullName}`}
                              options={STATUS_OPTIONS}
                              value={draftStatus[student.id] ?? AttendanceStatus.PRESENT}
                              onChange={(e) =>
                                handleStatusChange(student.id, e.target.value as AttendanceStatusValue)
                              }
                            />
                          )}
                        </td>
                        <td className="p-4">
                          {isLocked ? (
                            <span className="text-xs text-slate-500">{draftRemarks[student.id] || '—'}</span>
                          ) : (
                            <Input
                              aria-label={`Remarks for ${student.fullName}`}
                              placeholder="Optional note…"
                              value={draftRemarks[student.id] ?? ''}
                              onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!isLocked && (
                  <div className="flex justify-end border-t p-4">
                    <Button disabled={isSaving} onClick={() => void handleSave()}>
                      {isSaving ? 'Saving…' : `Save Attendance — ${selectedSubjectName}`}
                    </Button>
                  </div>
                )}
              </div>
            )
          )}
        </>
      )}

      <Modal
        isOpen={showReasonModal}
        onClose={() => setShowReasonModal(false)}
        title="Update Past Attendance"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowReasonModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmUnlock} disabled={!updateReason.trim()}>
              <Lock size={12} className="mr-1.5" />
              Unlock &amp; Edit
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          You are modifying attendance for <strong>{selectedSubjectName} — {selectedClass?.className}</strong> on{' '}
          <strong>{date}</strong>. Provide a reason — it will be saved as part of the audit trail.
        </p>
        <Textarea
          label="Reason for update"
          value={updateReason}
          onChange={(e) => setUpdateReason(e.target.value)}
          placeholder="e.g. Correcting an error — student was present but marked absent due to a register mix-up."
          rows={3}
        />
      </Modal>
    </div>
  );
}
