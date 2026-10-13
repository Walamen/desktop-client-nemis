'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CalendarClock, CalendarDays, CalendarRange, ClipboardList, DoorOpen, PenLine } from 'lucide-react';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { parseSetupDrawerTarget } from '@/lib/academic-setup';
import { GradingConfigDrawer } from './GradingConfigDrawer';
import { AcademicYearsDrawer } from './AcademicYearsDrawer';
import { TermsDrawer } from './TermsDrawer';
import { AssessmentPeriodsDrawer } from './AssessmentPeriodsDrawer';
import { GradeEntryWindowsDrawer } from './GradeEntryWindowsDrawer';
import type { SetupDrawer, SetupNavigate } from './setup-drawers';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

const GUIDE_STEPS = [
  {
    title: 'Configure the Grading System',
    body: 'Start here. Set your maximum marks, passing mark, number of terms per year, and periods per term. Also define your grade scale (A, B, C…).',
  },
  {
    title: 'Create the Academic Year',
    body: 'Add the school year with its start and end dates and set it as current. Terms, classes and reports all belong to the current year.',
  },
  {
    title: 'Add Terms',
    body: 'Add the terms in the academic year — how many comes from "terms per year" in the grading system — and set the current term.',
  },
  {
    title: 'Create Assessment Periods',
    body: 'Define the academic periods teachers will be submitting grades for. Each period has a start date, end date, and status (Upcoming, Active, or Completed).',
  },
  {
    title: 'Open Grade Entry Windows',
    body: 'A grade entry window controls whether teachers can submit grades for a grading period. Create a window, set the open and close dates, then open it so teachers can submit.',
  },
  {
    title: 'Review and Publish',
    body: 'Once a window closes, review the submitted grades and publish them so students and guardians can see their results.',
  },
];

/** School-admin Academic Grading landing page — mirrors portal-web's
 * academic-grading/page.tsx (GradingSystemManagement + Quick Start Guide), and
 * is also where the school's yearly setup lives: grading configuration,
 * academic years, terms, assessment periods and grade entry windows each open in a drawer, in
 * dependency order. Links elsewhere open a drawer with ?open= (see
 * lib/academic-setup.ts). Grade Entry stays disabled here: that's a teacher
 * task (recording marks against an open window), the same split already
 * applied to Attendance — school admins configure and review, teachers enter. */
export function AcademicGradingPage() {
  const [windows, setWindows] = useState<SchoolAdminRecord[] | null>(null);
  const [activeModal, setActiveModal] = useState<SetupDrawer | null>(null);
  const [termsYearId, setTermsYearId] = useState('');

  const loadWindows = useCallback(() => {
    void sharedBridge
      .listSchoolAdminRecords({ collection: 'grade_entry_windows', limit: 250 })
      .then((result) => setWindows(result.items));
  }, []);

  useRevalidateOnSync(() => {
    loadWindows();
  }, [loadWindows]);

  // Deep links (?open=terms&yearId=…) open a drawer whenever the query changes —
  // not just on mount: the sidebar is a persistent layout, so its "Grade Entry &
  // Results" link is a soft navigation that never remounts this page. A missing
  // or unknown `open` does nothing (it must not close a drawer that is open).
  const searchParams = useSearchParams();
  const openParam = searchParams.get('open') ?? '';
  const yearIdParam = searchParams.get('yearId') ?? '';
  useEffect(() => {
    const target = parseSetupDrawerTarget(openParam);
    if (!target) return;
    setTermsYearId(yearIdParam);
    setActiveModal(target);
  }, [openParam, yearIdParam]);

  // In-page switches drop the query too, so following the same deep link later
  // (e.g. the sidebar item again) is a real URL change and reopens its drawer.
  const navigate: SetupNavigate = useCallback((drawer, opts) => {
    setTermsYearId(opts?.yearId ?? '');
    setActiveModal(drawer);
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const close = useCallback(() => {
    setActiveModal(null);
    setTermsYearId('');
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
    // The Windows drawer keeps its own list; refresh the stat cards after any drawer closes.
    loadWindows();
  }, [loadWindows]);

  const count = (status: string) => (windows ?? []).filter((w) => w.status === status).length;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex items-center justify-between bg-primary px-6 py-5 text-white">
        <div>
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-400">School Admin Portal</p>
          <h1 className="text-xl font-bold">Academic Grading</h1>
        </div>
      </div>

      <div className="space-y-6 px-6 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard label="Active Windows" value={count('OPEN')} tone="text-active" />
          <StatCard label="Draft Windows" value={count('DRAFT')} tone="text-slate-600" />
          <StatCard label="Published" value={count('PUBLISHED')} tone="text-secondary" />
          <StatCard label="Total Windows" value={(windows ?? []).length} tone="text-slate-900" />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FeatureCard
            icon={<ClipboardList className="h-6 w-6 text-primary" />}
            title="Grading Configuration"
            description="Set up institution-wide grading rules, grade scales, and policies."
            action="Configure System"
            onClick={() => navigate('setup')}
          />
          <FeatureCard
            icon={<CalendarRange className="h-6 w-6 text-slate-500" />}
            title="Academic Years"
            description="Create the school year, set the current one, and close or archive past years."
            action="Manage Years"
            onClick={() => navigate('years')}
          />
          <FeatureCard
            icon={<CalendarDays className="h-6 w-6 text-slate-500" />}
            title="Terms"
            description="Add the terms in each academic year and choose the current term."
            action="Manage Terms"
            onClick={() => navigate('terms')}
          />
          <FeatureCard
            icon={<CalendarClock className="h-6 w-6 text-slate-500" />}
            title="Assessment Periods"
            description="Create and manage the assessment periods in each term."
            action="Manage Periods"
            onClick={() => navigate('periods')}
          />
          <FeatureCard
            icon={<DoorOpen className="h-6 w-6 text-slate-500" />}
            title="Grade Entry Windows"
            description="Control when teachers can enter and submit grades."
            action="Manage Windows"
            onClick={() => navigate('windows')}
          />
          <FeatureCard
            icon={<PenLine className="h-6 w-6 text-slate-400" />}
            title="Grade Entry"
            description="Teachers enter grades once a window is open — not a school-admin task on this device."
            action="Enter Grades"
            disabled
          />
        </div>

        <div>
          <div className="flex items-center gap-3 border border-slate-200 bg-white p-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Quick Start Guide</h2>
              <p className="text-sm text-slate-500">How the grading system works — follow these steps in order.</p>
            </div>
          </div>
          {GUIDE_STEPS.map((step, index) => (
            <div key={step.title} className="flex items-start gap-8 border border-t-0 border-slate-200 bg-white p-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center bg-slate-900 text-sm font-semibold text-white">
                {String(index + 1).padStart(2, '0')}
              </div>
              <div>
                <p className="font-semibold text-slate-900">{step.title}</p>
                <p className="text-sm text-slate-500">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <GradingConfigDrawer isOpen={activeModal === 'setup'} onClose={close} />
      <AcademicYearsDrawer isOpen={activeModal === 'years'} onClose={close} onNavigate={navigate} />
      <TermsDrawer isOpen={activeModal === 'terms'} onClose={close} onNavigate={navigate} yearId={termsYearId} />
      <AssessmentPeriodsDrawer isOpen={activeModal === 'periods'} onClose={close} onNavigate={navigate} />
      <GradeEntryWindowsDrawer isOpen={activeModal === 'windows'} onClose={close} onNavigate={navigate} />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-300 bg-white p-4 text-center">
      <p className="mb-1 text-sm text-slate-600">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  action,
  onClick,
  href,
  disabled,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const button = href ? (
    <Link
      href={href}
      className="inline-flex items-center rounded bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/80"
    >
      {action}
    </Link>
  ) : (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center rounded bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {action}
    </button>
  );
  return (
    <div className="rounded-card border border-slate-300 bg-white p-6">
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-slate-100 p-3">{icon}</div>
        <div className="flex-1">
          <h3 className="mb-2 text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mb-4 text-sm text-slate-600">{description}</p>
          {button}
        </div>
      </div>
    </div>
  );
}
