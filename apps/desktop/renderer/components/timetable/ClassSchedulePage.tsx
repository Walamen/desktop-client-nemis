'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  AlertTriangle, Calendar, Clock3, Coffee, Copy, Download, Plus, Printer, Trash2, Users,
} from 'lucide-react';
import { DayOfWeek, type DayOfWeek as DayValue, type TimetableEntryResult } from '@nemis-desktop/types';
import { Avatar, Button, Input, Modal, Select } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel, useAcademicYearViewModel, useSettingsViewModel, useTimetableViewModel } from '@/lib/presentation/hooks/school-admin';
import { downloadTimetableCsv, formatClassName, getClassTeacherSubjects, human, type ClassTeacherOption } from './shared';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

const WEEKDAYS: DayValue[] = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
const WEEKEND_DAYS: DayValue[] = [DayOfWeek.SATURDAY, DayOfWeek.SUNDAY];
const JS_DAY_TO_DAY_OF_WEEK: DayValue[] = [
  DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY,
];

interface PeriodRow {
  startTime: string;
  endTime: string;
  isBreak: boolean;
  isDraft: boolean;
  entries: TimetableEntryResult[];
}

interface CellEditorState {
  startTime: string;
  endTime: string;
  day: DayValue;
  entry: TimetableEntryResult | null;
}

/** School-admin General Schedule Management — mirrors portal-web's
 * timetable/page.tsx as the primary experience (pick a class, build its
 * weekly grid, click a cell to assign a teacher + subject, print / export).
 * All of it runs against desktop's real TimetableViewModel (genuine SQLite
 * CRUD, not a generic fallback) — the same one the previous, differently
 * styled desktop page already used. Desktop's extra real capabilities that
 * web doesn't have — dashboard stats, conflict detection, copy-timetable —
 * are kept as additional sections below the grid rather than dropped. */
export function ClassSchedulePage() {
  const timetable = useTimetableViewModel();
  const foundation = useAcademicFoundationViewModel();
  const academicYear = useAcademicYearViewModel();
  const settings = useSettingsViewModel();

  const entries = useViewModel(timetable.store, (s) => s.entries);
  const conflicts = useViewModel(timetable.store, (s) => s.conflicts);
  const dashboard = useViewModel(timetable.store, (s) => s.dashboard);
  const classesState = useViewModel(foundation.store, (s) => s.classes);
  const year = useViewModel(academicYear.store, (s) => s.current);
  const term = useViewModel(foundation.store, (s) => s.currentTerm);
  const school = useViewModel(settings.store, (s) => s.profile);

  const [selectedClassId, setSelectedClassId] = useState('');
  const [extraDays, setExtraDays] = useState<DayValue[]>([]);
  const [draftPeriods, setDraftPeriods] = useState<{ startTime: string; endTime: string }[]>([]);
  const [showAddPeriod, setShowAddPeriod] = useState(false);
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [newIsBreak, setNewIsBreak] = useState(false);
  const [addPeriodError, setAddPeriodError] = useState('');
  const [cellEditor, setCellEditor] = useState<CellEditorState | null>(null);
  const [editorStaffId, setEditorStaffId] = useState('');
  const [editorSubjectId, setEditorSubjectId] = useState('');
  const [classTeachers, setClassTeachers] = useState<ClassTeacherOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  const classes = useMemo(
    () => (classesState.status === 'success' || classesState.status === 'refreshing' ? classesState.data : []),
    [classesState],
  );
  const selectedClass = classes.find((c) => c.id === selectedClassId);

  useRevalidateOnSync(() => {
    void foundation.loadClasses();
    void academicYear.loadCurrent();
    void foundation.loadCurrentTerm();
    void settings.loadCurrentSchool();
    void timetable.loadDashboard();
     
  }, []);

  useEffect(() => {
    if (!selectedClassId && classes.length > 0) setSelectedClassId(classes[0]!.id);
  }, [classes, selectedClassId]);

  useEffect(() => {
    if (!selectedClassId) return;
    void timetable.loadClass(selectedClassId);
    void timetable.loadConflicts();
    void getClassTeacherSubjects(selectedClassId).then(setClassTeachers);
    setExtraDays([]);
    setDraftPeriods([]);
    setCellEditor(null);
    setShowAddPeriod(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId]);

  const schedule = useMemo(
    () => (entries.status === 'success' || entries.status === 'refreshing' ? entries.data : []),
    [entries],
  );
  const todayDay = JS_DAY_TO_DAY_OF_WEEK[new Date().getDay()]!;
  const visibleDays = [...WEEKDAYS, ...WEEKEND_DAYS.filter((d) => extraDays.includes(d) || schedule.some((e) => e.dayOfWeek === d))];

  const isBreakRow = (rowEntries: TimetableEntryResult[]) =>
    rowEntries.length > 0 && (rowEntries.some((e) => e.isBreak) || rowEntries.every((e) => !e.subjectId && !e.staffId));

  const periodRows: PeriodRow[] = useMemo(() => {
    const map = new Map<string, TimetableEntryResult[]>();
    schedule.forEach((entry) => {
      const key = `${entry.startTime}-${entry.endTime}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    });
    const list: PeriodRow[] = Array.from(map.entries()).map(([key, rowEntries]) => {
      const [startTime, endTime] = key.split('-') as [string, string];
      return { startTime, endTime, isBreak: isBreakRow(rowEntries), isDraft: false, entries: rowEntries };
    });
    draftPeriods.forEach((draft) => {
      const key = `${draft.startTime}-${draft.endTime}`;
      if (!map.has(key)) list.push({ ...draft, isBreak: false, isDraft: true, entries: [] });
    });
    return list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [schedule, draftPeriods]);

  const schoolId = school.status === 'success' || school.status === 'refreshing' ? school.data.id : '';

  const handleAddPeriod = async () => {
    setAddPeriodError('');
    if (!newStart || !newEnd) return setAddPeriodError('Please fill in both start and end time.');
    if (newEnd <= newStart) return setAddPeriodError('End time must be after start time.');
    if (periodRows.some((row) => row.startTime < newEnd && row.endTime > newStart)) {
      return setAddPeriodError('This period overlaps an existing period.');
    }
    if (newIsBreak) {
      if (!selectedClass || !schoolId) return;
      for (const day of visibleDays) {
        const outcome = await timetable.create({
          institutionId: schoolId, classId: selectedClass.id, dayOfWeek: day, startTime: newStart, endTime: newEnd, isBreak: true,
        });
        if (!outcome.ok) return setAddPeriodError('Failed to add break.');
      }
    } else {
      setDraftPeriods((rows) => [...rows, { startTime: newStart, endTime: newEnd }]);
    }
    setShowAddPeriod(false);
    setNewStart('');
    setNewEnd('');
    setNewIsBreak(false);
  };

  const handleDeleteRow = async (row: PeriodRow) => {
    if (row.entries.length > 0) {
      if (!window.confirm(`Delete this ${row.isBreak ? 'break' : 'period'} (${row.startTime} - ${row.endTime}) and all its entries?`)) return;
      for (const entry of row.entries) await timetable.remove(entry.id);
    }
    setDraftPeriods((rows) => rows.filter((d) => !(d.startTime === row.startTime && d.endTime === row.endTime)));
  };

  const openCellEditor = (row: PeriodRow, day: DayValue, entry: TimetableEntryResult | null) => {
    setCellEditor({ startTime: row.startTime, endTime: row.endTime, day, entry });
    setEditorStaffId(entry?.staffId ?? '');
    setEditorSubjectId(entry?.subjectId ?? '');
  };

  const closeCellEditor = () => {
    setCellEditor(null);
    setEditorStaffId('');
    setEditorSubjectId('');
  };

  const handleSaveCell = async () => {
    if (!cellEditor || !selectedClass || !editorStaffId || !editorSubjectId) return;
    setSaving(true);
    try {
      if (cellEditor.entry) {
        await timetable.update({ id: cellEditor.entry.id, classId: selectedClass.id, subjectId: editorSubjectId, staffId: editorStaffId });
      } else {
        await timetable.create({
          institutionId: schoolId, classId: selectedClass.id, subjectId: editorSubjectId, staffId: editorStaffId,
          dayOfWeek: cellEditor.day, startTime: cellEditor.startTime, endTime: cellEditor.endTime,
        });
      }
      closeCellEditor();
    } finally {
      setSaving(false);
    }
  };

  const handleClearCell = async () => {
    if (!cellEditor?.entry) return;
    setSaving(true);
    try {
      await timetable.remove(cellEditor.entry.id);
      closeCellEditor();
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    if (!selectedClass) return;
    const header = ['Period / Time', ...visibleDays.map((d) => human(d))];
    let periodNumber = 0;
    const rows = periodRows.map((row) => {
      if (row.isBreak) return [`Break (${row.startTime}-${row.endTime})`, ...visibleDays.map(() => 'BREAK')];
      periodNumber += 1;
      const label = `Period ${periodNumber} (${row.startTime}-${row.endTime})`;
      return [label, ...visibleDays.map((day) => {
        const entry = row.entries.find((e) => e.dayOfWeek === day);
        if (!entry) return '';
        return `${entry.subjectName ?? 'No Subject'} — ${entry.teacherName ?? 'No Teacher Assigned'}`;
      })];
    });
    downloadTimetableCsv(`timetable-${formatClassName(selectedClass.gradeLevel, selectedClass.section)}.csv`, [header, ...rows]);
  };

  const teacherOptions = classTeachers.map((t) => ({ value: t.teacherId, label: `${t.firstName} ${t.lastName}` }));
  const selectedTeacher = classTeachers.find((t) => t.teacherId === editorStaffId);
  const subjectOptions = selectedTeacher ? selectedTeacher.subjects.map((s) => ({ value: s.subjectId, label: s.subjectName })) : [];

  let periodNumber = 0;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex items-center justify-between bg-primary px-6 py-5 text-white">
        <div>
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-400">School Admin Portal</p>
          <h1 className="text-xl font-bold">General Schedule Management</h1>
        </div>
      </div>

      <div className="space-y-5 px-6 py-6">
        {/* Academic year banner */}
        <div className="rounded-lg border border-slate-300 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="mb-1 text-2xl font-bold text-slate-900">
                {(year.status === 'success' || year.status === 'refreshing') ? year.data.code : 'Academic Year'}
              </h2>
              <p className="text-slate-500">
                {(term.status === 'success' || term.status === 'refreshing') ? term.data.name : 'Current Term'} · School Timetable
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                disabled={!selectedClassId}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Printer className="mr-2 inline h-4 w-4" />
                Print
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={!selectedClassId || schedule.length === 0}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="mr-2 inline h-4 w-4" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => setCopyOpen(true)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-slate-50"
              >
                <Copy className="mr-2 inline h-4 w-4" />
                Copy timetable
              </button>
            </div>
          </div>
        </div>

        {/* Class selector */}
        <div className="rounded-lg border border-slate-300 bg-white p-6">
          <label className="mb-2 block text-sm font-medium text-gray-700">Select Class</label>
          {classesState.status === 'loading' ? (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-transparent" />
              <span className="text-sm text-gray-500">Loading classes…</span>
            </div>
          ) : (
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full rounded-full border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-none focus:ring-1 focus:ring-secondary/20"
            >
              <option value="">Select a class to view timetable</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{formatClassName(cls.gradeLevel, cls.section)}</option>
              ))}
            </select>
          )}
        </div>

        {/* Weekly grid */}
        <div className="rounded-lg border border-slate-300 bg-white">
          {!selectedClassId ? (
            <div className="py-12 text-center">
              <Calendar className="mx-auto mb-3 h-12 w-12 text-gray-400" />
              <p className="font-medium text-gray-900">No class selected</p>
              <p className="mt-1 text-sm text-gray-500">Select a class from the dropdown above to view its weekly timetable.</p>
            </div>
          ) : entries.status === 'loading' ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-transparent" />
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between rounded-lg bg-secondary/10 p-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {selectedClass && formatClassName(selectedClass.gradeLevel, selectedClass.section)} — Weekly Schedule
                  </h3>
                  <p className="mt-0.5 text-sm text-gray-500">Click any cell to assign or edit a teacher and subject.</p>
                </div>
                <div className="flex gap-2">
                  {WEEKEND_DAYS.filter((d) => !visibleDays.includes(d)).map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setExtraDays((d) => [...d, day])}
                      className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Plus className="mr-1 inline h-3.5 w-3.5" />
                      Add {human(day)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setAddPeriodError(''); setShowAddPeriod(true); }}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Period
                  </button>
                </div>
              </div>

              {periodRows.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
                  <Calendar className="mx-auto mb-3 h-12 w-12 text-gray-400" />
                  <p className="font-medium text-gray-900">No periods yet</p>
                  <p className="mt-1 text-sm text-gray-500">Click &ldquo;Add Period&rdquo; to start building this class&apos;s timetable.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-blue-100">
                        <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-gray-700">Period / Time</th>
                        {visibleDays.map((day) => (
                          <th key={day} className={`border border-gray-200 px-4 py-3 text-center font-semibold ${day === todayDay ? 'bg-active text-white' : 'text-gray-700'}`}>
                            {human(day)}
                            {day === todayDay && <span className="mt-1 block text-xs font-normal">· Today</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {periodRows.map((row) => {
                        const rowKey = `${row.startTime}-${row.endTime}`;
                        if (row.isBreak) {
                          return (
                            <tr key={rowKey} className="group bg-green-50">
                              <td className="border border-green-200 px-4 py-4 font-medium text-green-700">
                                <div className="relative text-center">
                                  <div className="flex items-center justify-center gap-2 text-sm font-semibold">
                                    <Coffee className="h-4 w-4" /><span>Break</span>
                                  </div>
                                  <div className="mt-1 text-xs">{row.startTime} - {row.endTime}</div>
                                  <button type="button" onClick={() => void handleDeleteRow(row)} title="Delete break" className="absolute -right-2 -top-2 rounded p-1 text-green-700 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                              <td colSpan={visibleDays.length} className="border border-green-200 px-4 py-4 text-center">
                                <div className="flex items-center justify-center gap-2 font-medium text-green-700">
                                  <Coffee className="h-5 w-5" /><span>BREAK / RECESS — time to refresh and recharge!</span>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        periodNumber += 1;
                        const currentPeriodNumber = periodNumber;
                        return (
                          <tr key={rowKey} className="group hover:bg-gray-50">
                            <td className="border border-gray-200 px-4 py-4 font-medium text-gray-700">
                              <div className="relative text-center">
                                <div className="text-sm font-semibold text-gray-900">Period {currentPeriodNumber}</div>
                                <div className="mt-1 text-xs text-gray-600">{row.startTime} - {row.endTime}</div>
                                <button type="button" onClick={() => void handleDeleteRow(row)} title="Delete period" className="absolute -right-2 -top-2 rounded p-1 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                            {visibleDays.map((day) => {
                              const entry = row.entries.find((e) => e.dayOfWeek === day) ?? null;
                              return (
                                <td key={day} className={`border border-gray-200 p-0 ${day === todayDay ? 'bg-active/10' : ''}`}>
                                  <button
                                    type="button"
                                    onClick={() => openCellEditor(row, day, entry)}
                                    className="h-full w-full px-4 py-4 text-center transition-colors hover:bg-sky-50"
                                    title={entry ? 'Edit this entry' : 'Assign teacher & subject'}
                                  >
                                    {entry ? (
                                      <div className="space-y-2">
                                        <div className="font-semibold text-gray-900">{entry.subjectName ?? 'No Subject'}</div>
                                        {entry.teacherName ? (
                                          <div className="flex flex-col items-center gap-1">
                                            <Avatar firstName={entry.teacherName.split(' ')[0]} lastName={entry.teacherName.split(' ').slice(1).join(' ')} role="teacher" size="sm" className="border-2 border-gray-200" />
                                            <div className="text-xs text-gray-600">{entry.teacherName}</div>
                                          </div>
                                        ) : (
                                          <div className="text-xs font-medium text-red-600">No Teacher Assigned</div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="text-lg font-light text-gray-300">
                                        <Plus className="mx-auto h-5 w-5" />
                                      </div>
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Real desktop extras web doesn't have: dashboard, conflicts */}
        {(dashboard.status === 'success' || dashboard.status === 'refreshing') && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardCard label="Total entries" value={dashboard.data.totalEntries} icon={Calendar} />
            <DashboardCard label="Today's schedule" value={dashboard.data.todayEntries} icon={Clock3} />
            <DashboardCard label="Classes scheduled today" value={dashboard.data.classesScheduledToday} icon={Users} />
            <DashboardCard label="Pending conflicts" value={dashboard.data.pendingConflicts} icon={AlertTriangle} />
          </div>
        )}

        <div className="rounded-card border border-slate-300 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Schedule validation</h2>
          <p className="mt-1 text-xs text-slate-500">Offline conflict detection for the selected class — no server round-trip required.</p>
          {conflicts.status === 'loading' ? (
            <div className="mt-4 h-16 w-full animate-pulse rounded-lg bg-slate-100" />
          ) : conflicts.status === 'error' ? (
            <p className="mt-4 text-sm text-red-700">{conflicts.error.userMessage}</p>
          ) : !selectedClassId ? (
            <p className="mt-4 text-sm text-slate-400">Select a class to check for scheduling conflicts.</p>
          ) : conflicts.status === 'success' || conflicts.status === 'refreshing' ? (
            conflicts.data.length === 0 ? (
              <p className="mt-4 text-sm text-emerald-700">No conflicts detected.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {conflicts.data.map((c, i) => (
                  <li key={`${c.type}-${i}`} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                    <b>{human(c.type)}:</b> {c.message}
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </div>

      {/* Add Period modal */}
      <Modal
        isOpen={showAddPeriod}
        onClose={() => setShowAddPeriod(false)}
        title="Add Period"
        footer={<>
          <Button variant="secondary" onClick={() => setShowAddPeriod(false)}>Cancel</Button>
          <Button onClick={() => void handleAddPeriod()} disabled={!newStart || !newEnd}>Add Period</Button>
        </>}
      >
        <div className="space-y-4">
          {addPeriodError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{addPeriodError}</div>}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Input label="Start Time" type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
            </div>
            <div className="flex-1">
              <Input label="End Time" type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <input type="checkbox" checked={newIsBreak} onChange={(e) => setNewIsBreak(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            <Coffee className="h-4 w-4 text-green-600" />
            This is a break / recess
          </label>
        </div>
      </Modal>

      {/* Cell editor modal */}
      <Modal
        isOpen={cellEditor !== null}
        onClose={closeCellEditor}
        title={cellEditor?.entry ? 'Edit Entry' : 'Assign Teacher & Subject'}
        footer={<>
          {cellEditor?.entry && (
            <Button variant="destructive" onClick={() => void handleClearCell()} disabled={saving}>
              {saving ? 'Clearing…' : 'Clear'}
            </Button>
          )}
          <Button variant="secondary" onClick={closeCellEditor} disabled={saving}>Cancel</Button>
          <Button onClick={() => void handleSaveCell()} disabled={saving || !editorStaffId || !editorSubjectId}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>}
      >
        {cellEditor && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{human(cellEditor.day)} · {cellEditor.startTime} - {cellEditor.endTime}</p>
            {classTeachers.length === 0 ? (
              <p className="text-sm italic text-gray-400">No teachers are assigned to this class yet. Assign them from the class detail page first.</p>
            ) : (
              <Select
                label="Teacher"
                required
                value={editorStaffId}
                onChange={(e) => { setEditorStaffId(e.target.value); setEditorSubjectId(''); }}
                options={teacherOptions}
                placeholder="Select Teacher"
              />
            )}
            <Select
              label="Subject"
              required
              value={editorSubjectId}
              onChange={(e) => setEditorSubjectId(e.target.value)}
              options={subjectOptions}
              placeholder={!editorStaffId ? 'Select teacher first' : subjectOptions.length === 0 ? 'No subjects assigned in this class' : 'Select Subject'}
              disabled={!editorStaffId || subjectOptions.length === 0}
            />
          </div>
        )}
      </Modal>

      {/* Copy timetable dialog — real desktop capability, no web equivalent */}
      <CopyDialog isOpen={copyOpen} classes={classes} onClose={() => setCopyOpen(false)} onCopy={async (source, target) => {
        const result = await timetable.copy({ sourceClassId: source, targetClassId: target });
        if (result.ok) setCopyOpen(false);
      }} />
    </div>
  );
}

function DashboardCard({ label, value, icon: Icon }: { label: string; value: number; icon: ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-card border border-slate-300 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon className="h-5 w-5 text-secondary" />
      </div>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

interface CopyOption { id: string; gradeLevel: string; section?: string }

function CopyDialog({ isOpen, classes, onClose, onCopy }: {
  isOpen: boolean; classes: readonly CopyOption[]; onClose: () => void; onCopy: (source: string, target: string) => Promise<void>;
}) {
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const options = classes.map((c) => ({ value: c.id, label: formatClassName(c.gradeLevel, c.section) }));
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Copy class timetable"
      footer={<Button disabled={!source || !target || source === target} onClick={() => void onCopy(source, target)}>Copy schedule</Button>}
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Teacher assignments must already exist in the destination class. The copy is atomic and stops if any conflict is found.</p>
        <Select label="Source class" value={source} onChange={(e) => setSource(e.target.value)} options={options} placeholder="Select source class" />
        <Select label="Destination class" value={target} onChange={(e) => setTarget(e.target.value)} options={options} placeholder="Select destination class" />
      </div>
    </Modal>
  );
}
