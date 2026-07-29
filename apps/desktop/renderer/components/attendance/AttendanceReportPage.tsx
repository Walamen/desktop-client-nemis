'use client';
import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '@nemis-desktop/ui';
import { Search, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Clock, MinusCircle } from 'lucide-react';
import { useViewModel } from '@/hooks/use-view-model';
import {
  useAcademicFoundationViewModel,
  useAttendanceViewModel,
  useSettingsViewModel,
  useStudentsViewModel,
} from '@/lib/presentation/hooks';

const RECORDS_PER_PAGE = 15;

type StatusFilter = 'ALL' | 'PRESENT' | 'ABSENT' | 'LATE' | 'NOT_MARKED';

const STATUS_STYLES: Record<string, string> = {
  Present: 'bg-blue-100 text-blue-800',
  Absent: 'bg-red-100 text-red-800',
  Late: 'bg-orange-100 text-orange-800',
  Excused: 'bg-purple-100 text-purple-800',
  Sick: 'bg-yellow-100 text-yellow-800',
};

function formatDateLong(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/** School-admin Attendance — VIEW ONLY, matching portal-web exactly. School
 * admins never mark or edit attendance here; that capability stays on the
 * Teacher module's AttendancePage, which uses the same ViewModel's write
 * path. Web's per-record "Recorded By" / "Time" columns and subject tabs are
 * dropped rather than faked: the desktop attendance table only ever stores
 * one general (subject-less) record per student per day with no recorder
 * attribution (see SqliteAttendanceRepository — subjectId and recordedBy are
 * always written as NULL), so those fields never carry real data here. */
export function AttendanceReportPage() {
  const academics = useAcademicFoundationViewModel();
  const attendance = useAttendanceViewModel();
  const students = useStudentsViewModel();
  const settings = useSettingsViewModel();

  const classes = useViewModel(academics.store, (s) => s.classes);
  const records = useViewModel(attendance.store, (s) => s.records);
  const studentList = useViewModel(students.store, (s) => s.list);
  const profile = useViewModel(settings.store, (s) => s.profile);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(today);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  const schoolName = profile.status === 'success' || profile.status === 'refreshing' ? profile.data.name : 'School';

  useEffect(() => {
    void academics.loadClasses();
    void settings.loadCurrentSchool();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!classId && (classes.status === 'success' || classes.status === 'refreshing')) {
      setClassId(classes.data[0]?.id ?? '');
    }
  }, [classId, classes]);

  useEffect(() => {
    setCurrentPage(1);
  }, [classId, date, searchQuery, statusFilter]);

  useEffect(() => {
    if (!classId) return;
    students.setFilters({ classId, isActive: true, sort: 'name' });
    void Promise.all([students.loadStudents(), attendance.loadAttendance(classId, date)]);
  }, [attendance, classId, date, students]);

  const isLoading =
    classes.status === 'loading' ||
    studentList.status === 'loading' ||
    records.status === 'loading';

  const mergedRows = useMemo(() => {
    const studentRows = studentList.status === 'success' || studentList.status === 'refreshing' ? studentList.data : [];
    const recordRows = records.status === 'success' || records.status === 'refreshing' ? records.data : [];
    return studentRows.map((student) => {
      const record = recordRows.find((r) => r.studentId === student.id);
      return {
        id: student.id,
        fullName: student.fullName,
        admissionNumber: student.admissionNumber,
        gradeLevel: student.gradeLevel,
        statusLabel: record?.status.label,
      };
    });
  }, [studentList, records]);

  const filteredRows = useMemo(() => {
    return mergedRows.filter((row) => {
      const matchesSearch =
        searchQuery === '' ||
        row.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.admissionNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'NOT_MARKED'
            ? !row.statusLabel
            : row.statusLabel?.toUpperCase() === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [mergedRows, searchQuery, statusFilter]);

  const summary = useMemo(() => {
    const present = mergedRows.filter((r) => r.statusLabel === 'Present').length;
    const absent = mergedRows.filter((r) => r.statusLabel === 'Absent').length;
    const late = mergedRows.filter((r) => r.statusLabel === 'Late').length;
    const notMarked = mergedRows.filter((r) => !r.statusLabel).length;
    return { present, absent, late, notMarked, total: mergedRows.length };
  }, [mergedRows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / RECORDS_PER_PAGE));
  const paginatedRows = filteredRows.slice((currentPage - 1) * RECORDS_PER_PAGE, currentPage * RECORDS_PER_PAGE);

  const classOptions = classes.status === 'success' || classes.status === 'refreshing' ? classes.data.filter((c) => c.isActive) : [];
  const selectedClassName = classOptions.find((c) => c.id === classId)?.name ?? '';

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
    .reduce<(number | '…')[]>((acc, p, i, arr) => {
      if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('…');
      acc.push(p);
      return acc;
    }, []);

  return (
    <div className="min-h-full bg-slate-100">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">School Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Attendance Management</h1>
        </div>
        <p className="text-sm font-medium text-slate-300">{schoolName}</p>
      </div>

      <div className="px-6 py-6 space-y-4">
        <div className="bg-white rounded-lg border border-slate-300 p-4">
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-full focus:outline-none text-sm focus:ring-2 focus:ring-secondary/10 focus:border-blue-500"
            >
              <option value="">— Select a class —</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-secondary/5 focus:border-blue-500"
            />

            <div className="flex-1" />

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search student…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-secondary/5 focus:border-blue-500 w-48"
              />
            </div>

            <div className="flex gap-1.5">
              {(
                [
                  { key: 'ALL', label: 'All' },
                  { key: 'PRESENT', label: 'Present' },
                  { key: 'ABSENT', label: 'Absent' },
                  { key: 'LATE', label: 'Late' },
                  { key: 'NOT_MARKED', label: 'Not Marked' },
                ] as { key: StatusFilter; label: string }[]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                    statusFilter === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!classId || isLoading ? (
          <div className="bg-white rounded-2xl shadow-sm flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{selectedClassName}</span>
              <span>—</span>
              <span>{formatDateLong(date)}</span>
              <span className="ml-1 text-slate-400">({mergedRows.length} students)</span>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-3 flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-emerald-600" />
                <span className="text-sm font-extrabold text-emerald-700">{summary.present}</span>
                <span className="text-[11px] text-emerald-600 font-semibold">Present</span>
              </div>
              <div className="flex items-center gap-1.5">
                <XCircle size={15} className="text-red-600" />
                <span className="text-sm font-extrabold text-red-700">{summary.absent}</span>
                <span className="text-[11px] text-red-600 font-semibold">Absent</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock size={15} className="text-amber-600" />
                <span className="text-sm font-extrabold text-amber-700">{summary.late}</span>
                <span className="text-[11px] text-amber-600 font-semibold">Late</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MinusCircle size={15} className="text-slate-400" />
                <span className="text-sm font-extrabold text-slate-500">{summary.notMarked}</span>
                <span className="text-[11px] text-slate-400 font-semibold">Not Marked</span>
              </div>
              <div className="flex-1" />
              <span className="text-xs text-slate-400">{summary.total} students</span>
            </div>

            <div className="bg-white rounded-lg border border-slate-300 overflow-hidden">
              {paginatedRows.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-slate-500">No students match the current filters.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-secondary/20 border-b border-slate-100">
                        <tr>
                          <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Student</th>
                          <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Grade</th>
                          <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedRows.map((row) => {
                          const [firstName, ...rest] = row.fullName.split(' ');
                          const lastName = rest.join(' ');
                          return (
                            <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-3.5 whitespace-nowrap">
                                <div className="flex items-center gap-3">
                                  <Avatar firstName={firstName} lastName={lastName} role="student" size="sm" />
                                  <div>
                                    <div className="text-sm font-semibold text-slate-900">{row.fullName}</div>
                                    <div className="text-[11px] text-slate-400">{row.admissionNumber}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-3.5 whitespace-nowrap text-sm text-slate-700">{row.gradeLevel}</td>
                              <td className="px-6 py-3.5 whitespace-nowrap">
                                {row.statusLabel ? (
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[row.statusLabel] ?? 'bg-gray-100 text-gray-600'}`}>
                                    {row.statusLabel}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                                    <MinusCircle size={11} />
                                    Not Marked
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
                      <span className="text-xs text-slate-500">
                        {(currentPage - 1) * RECORDS_PER_PAGE + 1}–{Math.min(currentPage * RECORDS_PER_PAGE, filteredRows.length)} of {filteredRows.length}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        {pageNumbers.map((p, i) =>
                          p === '…' ? (
                            <span key={`ellipsis-${i}`} className="px-1 text-slate-400 text-xs">
                              …
                            </span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => setCurrentPage(p)}
                              className={`w-7 h-7 rounded-lg text-xs font-semibold transition-colors ${
                                currentPage === p ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {p}
                            </button>
                          ),
                        )}
                        <button
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
