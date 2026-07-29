'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarRange, ClipboardList, DoorOpen, PenLine } from 'lucide-react';
import { nemisBridge } from '@/services/nemis-bridge';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { GradingConfigDrawer } from './GradingConfigDrawer';
import { GradingPeriodsDrawer } from './GradingPeriodsDrawer';

type ModalKey = 'setup' | 'periods' | null;

const GUIDE_STEPS = [
  {
    title: 'Configure the Grading System',
    body: 'Start here. Set your maximum marks, passing mark, number of terms per year, and periods per term. Also define your grade scale (A, B, C…).',
  },
  {
    title: 'Create Grading Periods',
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
 * academic-grading/page.tsx (GradingSystemManagement + Quick Start Guide).
 * Grade Entry stays disabled here: that's a teacher task (recording marks
 * against an open window), the same split already applied to Attendance —
 * school admins configure and review, teachers enter. */
export function AcademicGradingPage() {
  const [windows, setWindows] = useState<SchoolAdminRecord[] | null>(null);
  const [activeModal, setActiveModal] = useState<ModalKey>(null);

  useEffect(() => {
    void nemisBridge
      .listSchoolAdminRecords({ collection: 'grade_entry_windows', limit: 250 })
      .then((result) => setWindows(result.items));
  }, []);

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
            onClick={() => setActiveModal('setup')}
          />
          <FeatureCard
            icon={<CalendarRange className="h-6 w-6 text-slate-500" />}
            title="Grading Periods"
            description="Create and manage grading periods for each term."
            action="Manage Periods"
            onClick={() => setActiveModal('periods')}
          />
          <FeatureCard
            icon={<DoorOpen className="h-6 w-6 text-slate-500" />}
            title="Grade Entry Windows"
            description="Control when teachers can enter and submit grades."
            action="Manage Windows"
            href="/government/school-admin/academic-grading/windows"
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

      <GradingConfigDrawer isOpen={activeModal === 'setup'} onClose={() => setActiveModal(null)} />
      <GradingPeriodsDrawer isOpen={activeModal === 'periods'} onClose={() => setActiveModal(null)} />
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
