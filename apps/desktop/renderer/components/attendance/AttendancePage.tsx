'use client';

import { useEffect, useMemo, useState } from 'react';
import { AttendanceStatus, type AttendanceStatus as AttendanceStatusValue } from '@nemis-desktop/types';
import { Button, EmptyState, ErrorState, Select, Skeleton } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import {
  useAcademicFoundationViewModel,
  useAttendanceViewModel,
  useStudentsViewModel,
} from '@/lib/presentation/hooks';

const statusOptions = Object.values(AttendanceStatus).map((status) => ({
  value: status,
  label: status.charAt(0) + status.slice(1).toLowerCase(),
}));

export function AttendancePage() {
  const academics = useAcademicFoundationViewModel();
  const attendance = useAttendanceViewModel();
  const students = useStudentsViewModel();
  const classes = useViewModel(academics.store, (state) => state.classes);
  const records = useViewModel(attendance.store, (state) => state.records);
  const studentList = useViewModel(students.store, (state) => state.list);
  const submission = useViewModel(attendance.store, (state) => state.submission);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [draft, setDraft] = useState<Record<string, AttendanceStatusValue>>({});

  useEffect(() => {
    void academics.loadClasses();
  }, [academics]);

  useEffect(() => {
    if (!classId && (classes.status === 'success' || classes.status === 'refreshing')) {
      setClassId(classes.data[0]?.id ?? '');
    }
  }, [classId, classes]);

  useEffect(() => {
    if (!classId) return;
    students.setFilters({ classId, isActive: true, sort: 'name' });
    void Promise.all([
      students.loadStudents(),
      attendance.loadAttendance(classId, date),
    ]);
  }, [attendance, classId, date, students]);

  useEffect(() => {
    if (records.status !== 'success' && records.status !== 'refreshing') return;
    setDraft(Object.fromEntries(records.data.map((record) => [
      record.studentId,
      record.status.label.toUpperCase() as AttendanceStatusValue,
    ])));
  }, [records]);

  const classOptions = useMemo(
    () => classes.status === 'success' || classes.status === 'refreshing'
      ? classes.data.filter((item) => item.isActive).map((item) => ({
          value: item.id,
          label: item.section ? `${item.name} — ${item.section}` : item.name,
        }))
      : [],
    [classes],
  );

  async function saveAll(): Promise<void> {
    if (studentList.status !== 'success' && studentList.status !== 'refreshing') return;
    for (const student of studentList.data) {
      await attendance.recordAttendance({
        studentId: student.id,
        classId,
        date,
        status: draft[student.id] ?? AttendanceStatus.PRESENT,
      });
    }
  }

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Attendance Management</h1>
        <p className="mt-1 text-sm text-slate-500">
          Record class attendance locally. Provisioned records remain available offline.
        </p>
      </div>
      <div className="grid gap-4 rounded-card border border-slate-200 bg-white p-4 md:grid-cols-2">
        <Select
          label="Class"
          options={classOptions}
          placeholder="Select a class"
          value={classId}
          onChange={(event) => setClassId(event.target.value)}
        />
        <label className="text-sm font-medium text-slate-700">
          Date
          <input
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      </div>
      {(classes.status === 'loading' || studentList.status === 'loading') && (
        <Skeleton className="h-56 w-full" />
      )}
      {studentList.status === 'error' && <ErrorState message={studentList.error.userMessage} />}
      {classId && studentList.status === 'empty' && (
        <EmptyState
          title="No enrolled students"
          description="Enroll students in this class before recording attendance."
        />
      )}
      {(studentList.status === 'success' || studentList.status === 'refreshing') && (
        <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="p-4">Student</th>
                <th className="p-4">Student number</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {studentList.data.map((student) => (
                <tr key={student.id} className="border-b last:border-0">
                  <td className="p-4 font-medium">{student.fullName}</td>
                  <td className="p-4 font-mono">{student.admissionNumber}</td>
                  <td className="p-4">
                    <Select
                      aria-label={`Attendance for ${student.fullName}`}
                      options={statusOptions}
                      value={draft[student.id] ?? AttendanceStatus.PRESENT}
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        [student.id]: event.target.value as AttendanceStatusValue,
                      }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end border-t p-4">
            <Button disabled={submission === 'submitting'} onClick={() => void saveAll()}>
              {submission === 'submitting' ? 'Saving…' : 'Save attendance'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
