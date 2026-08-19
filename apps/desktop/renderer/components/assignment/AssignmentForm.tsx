'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Paperclip, X } from 'lucide-react';
import { AssignmentType, type PickAttachmentResult } from '@nemis-desktop/types';
import { Alert, Input, RichTextEditor, Select, Skeleton } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import { useTeachingAssignmentViewModel } from '@/lib/presentation/hooks/school-admin';
import { useAssignmentsViewModel } from '@/lib/presentation/hooks/teacher';
import { assignmentBridge } from '@/services/nemis-bridge/teacher/assignment-bridge';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { groupClassesWithSubjects } from './shared';

const ASSIGNMENT_TYPES: { value: AssignmentType; label: string }[] = [
  { value: AssignmentType.HOMEWORK, label: 'Homework' },
  { value: AssignmentType.PROJECT, label: 'Project' },
  { value: AssignmentType.QUIZ, label: 'Quiz' },
  { value: AssignmentType.TEST, label: 'Test' },
  { value: AssignmentType.EXAM, label: 'Exam' },
  { value: AssignmentType.PRESENTATION, label: 'Presentation' },
];

interface FormState {
  title: string;
  classId: string;
  subjectId: string;
  type: AssignmentType;
  dueDate: string;
  totalMarks: number | '';
  instructions: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  classId: '',
  subjectId: '',
  type: AssignmentType.HOMEWORK,
  dueDate: '',
  totalMarks: '',
  instructions: '',
};

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
      {children}
      {required && <span className="text-error ml-0.5">*</span>}
    </label>
  );
}

const fieldClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary disabled:bg-gray-50 disabled:text-gray-500';

interface AssignmentFormProps {
  mode: 'create' | 'edit';
  /** Required in edit mode — the assignment to load and patch. */
  assignmentId?: string;
}

export function AssignmentForm({ mode, assignmentId }: AssignmentFormProps) {
  const router = useRouter();
  const currentUser = useCurrentUserViewModel();
  const teachingAssignments = useTeachingAssignmentViewModel();
  const assignmentsVm = useAssignmentsViewModel();

  const user = useViewModel(currentUser.store, (s) => s.user);
  const teachingRows = useViewModel(teachingAssignments.store, (s) => s.assignments);
  const detail = useViewModel(assignmentsVm.store, (s) => s.detail);

  const teacherId = user.status === 'success' ? user.data.id : undefined;

  // The signed-in identity (`teacherId`, the `users` table) and the id every
  // teaching-assignment record is keyed by (`staff.id`) are different id
  // spaces — `staff.userId` is the (unique) bridge between them. Mirrors
  // government/teacher/page.tsx. `teacherId` itself stays in use for the
  // assignment calls below, whose ownership is re-injected server-side from
  // the caller's own staff id regardless of what's sent (see
  // handlers/teacher/assignments.ts), so the mismatch is harmless there.
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

  useRevalidateOnSync(() => {
    if (staffId) void teachingAssignments.load(staffId);
  }, [staffId, teachingAssignments]);

  useEffect(() => {
    if (mode === 'edit' && assignmentId && teacherId) {
      void assignmentsVm.loadAssignment(assignmentId, teacherId);
    }
  }, [mode, assignmentId, teacherId, assignmentsVm]);

  useEffect(() => {
    if (mode !== 'edit' || detail.status !== 'error') return;
    const timer = setTimeout(() => router.push('/government/teacher/assignment'), 1500);
    return () => clearTimeout(timer);
  }, [mode, detail.status, router]);

  const hasTeachingData = teachingRows.status === 'success' || teachingRows.status === 'refreshing';
  const myClasses = useMemo(
    () => (hasTeachingData ? groupClassesWithSubjects(teachingRows.data) : []),
    [hasTeachingData, teachingRows],
  );

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [initialized, setInitialized] = useState(mode === 'create');
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  // A freshly-picked file replaces whatever attachment already exists once
  // saved; until then it's purely local state — nothing is staged or
  // uploaded until the teacher actually saves the form.
  const [pickedFile, setPickedFile] = useState<PickAttachmentResult | null>(null);
  const [pickError, setPickError] = useState('');

  async function pickAttachment() {
    setPickError('');
    try {
      const picked = await assignmentBridge.pickAssignmentAttachment();
      if (picked) setPickedFile(picked);
    } catch {
      setPickError('Could not open the file picker.');
    }
  }

  useEffect(() => {
    if (mode === 'edit' && !initialized && detail.status === 'success') {
      const a = detail.data;
      setForm({
        title: a.title,
        classId: a.classId,
        subjectId: a.subjectId ?? '',
        type: a.type as AssignmentType,
        dueDate: a.dueDate,
        totalMarks: a.totalMarks ?? '',
        instructions: a.instructions ?? '',
      });
      setInitialized(true);
    }
  }, [mode, initialized, detail]);

  const subjects = myClasses.find((c) => c.classId === form.classId)?.subjects ?? [];
  const existingStatus = mode === 'edit' && detail.status === 'success' ? detail.data.status.label : undefined;
  const isEditingActive = mode === 'edit' && existingStatus === 'Active';

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (key === 'classId' ? { ...prev, classId: value as string, subjectId: '' } : { ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.classId) e.classId = 'Class is required';
    if (!form.dueDate) e.dueDate = 'Due date is required';
    else if (new Date(form.dueDate) <= new Date()) e.dueDate = 'Due date must be in the future';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(status: 'DRAFT' | 'ACTIVE') {
    if (!validate() || !teacherId) return;
    if (status === 'ACTIVE' && !form.instructions.replace(/<[^>]+>/g, '').trim()) {
      setSubmitError('Please add instructions before sending.');
      return;
    }
    setSubmitError('');
    setBusy(true);
    try {
      const outcome =
        mode === 'create'
          ? await assignmentsVm.createAssignment({
              classId: form.classId,
              subjectId: form.subjectId || undefined,
              teacherId,
              title: form.title.trim(),
              type: form.type,
              status,
              instructions: form.instructions || undefined,
              dueDate: form.dueDate,
              totalMarks: form.totalMarks === '' ? undefined : Number(form.totalMarks),
              attachmentFilePath: pickedFile?.path,
            })
          : await assignmentsVm.updateAssignment({
              id: assignmentId!,
              teacherId,
              title: form.title.trim(),
              subjectId: form.subjectId || undefined,
              type: form.type,
              status,
              instructions: form.instructions || undefined,
              dueDate: form.dueDate,
              totalMarks: form.totalMarks === '' ? undefined : Number(form.totalMarks),
              attachmentFilePath: pickedFile?.path,
            });
      if (outcome.ok) {
        router.push('/government/teacher/assignment');
      } else {
        setSubmitError(outcome.error.userMessage);
      }
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'edit' && !initialized) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (mode === 'edit' && detail.status === 'error') {
    return <Alert variant="error">Assignment not found or failed to load. Returning to your assignments…</Alert>;
  }

  return (
    <div className="space-y-6 p-6">
      <button
        type="button"
        onClick={() => router.push('/government/teacher/assignment')}
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Assignments
      </button>

      <div>
        <h1 className="text-2xl font-bold text-primary">
          {mode === 'create' ? 'Create Assignment' : 'Edit Assignment'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {mode === 'create'
            ? 'Fill in the details and write your assignment instructions'
            : 'Update the assignment details below'}
        </p>
      </div>

      {isEditingActive && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Students have already received this assignment. Saving changes will update what they see.
          </p>
        </div>
      )}

      {submitError && <Alert variant="error">{submitError}</Alert>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="Title"
          required
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. Chapter 5 Homework"
          error={errors.title}
        />
        <div>
          <Label required>Class</Label>
          <select
            className={fieldClass}
            value={form.classId}
            onChange={(e) => set('classId', e.target.value)}
            disabled={mode === 'edit'}
          >
            <option value="">Select a class…</option>
            {myClasses.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.className}
              </option>
            ))}
          </select>
          {errors.classId && <p className="text-xs text-error mt-1">{errors.classId}</p>}
        </div>
        <div>
          <Label>Subject</Label>
          <select
            className={fieldClass}
            value={form.subjectId}
            onChange={(e) => set('subjectId', e.target.value)}
            disabled={!form.classId}
          >
            <option value="">Select subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="Due Date"
          required
          type="date"
          value={form.dueDate}
          onChange={(e) => set('dueDate', e.target.value)}
          error={errors.dueDate}
        />
        <Input
          label="Total Marks"
          type="number"
          min="0"
          value={form.totalMarks}
          onChange={(e) => set('totalMarks', e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="e.g. 100"
        />
        <div>
          <Label>Assignment Type</Label>
          <Select
            options={ASSIGNMENT_TYPES}
            value={form.type}
            onChange={(e) => set('type', e.target.value as AssignmentType)}
          />
        </div>
      </div>

      <hr className="border-gray-200" />

      <RichTextEditor
        label="Instructions"
        content={form.instructions}
        onChange={(html) => set('instructions', html)}
        placeholder="Write your assignment instructions here…"
      />

      <div>
        <Label>
          Attachment <span className="font-normal text-gray-400">(optional — a supporting file)</span>
        </Label>
        {pickError && <p className="text-xs text-error mb-1.5">{pickError}</p>}
        {pickedFile || (mode === 'edit' && detail.status === 'success' && detail.data.attachmentName) ? (
          <div className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg bg-gray-50">
            <Paperclip className="w-4 h-4 text-secondary flex-shrink-0" />
            <span className="text-sm text-gray-700 flex-1 truncate">
              {pickedFile?.name ?? (detail.status === 'success' ? detail.data.attachmentName : '')}
            </span>
            <button
              type="button"
              onClick={() => setPickedFile(null)}
              className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors"
              title="Remove attachment"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void pickAttachment()}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-secondary/50 rounded-lg p-6 text-sm font-medium text-secondary transition-colors"
          >
            <Paperclip className="w-4 h-4" />
            Click to attach a file (PDF, Word, Excel, PowerPoint)
          </button>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={() => void submit('DRAFT')}
          disabled={busy}
          className="px-4 py-2 border border-gray-300 rounded-button text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Save as Draft
        </button>
        <button
          type="button"
          onClick={() => void submit('ACTIVE')}
          disabled={busy}
          className="px-4 py-2 bg-primary text-white rounded-button text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {busy ? 'Saving…' : mode === 'create' ? 'Send to Class →' : 'Save Changes →'}
        </button>
      </div>
    </div>
  );
}
