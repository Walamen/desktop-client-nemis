import { GradingPeriodsPanel } from '@/components/academic-grading/GradingPeriodsPanel';

export default function Page() {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-primary px-6 py-5 text-white">
        <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-400">School Admin Portal</p>
        <h1 className="text-xl font-bold">Assessment Periods</h1>
      </div>
      <div className="px-6 py-6">
        <GradingPeriodsPanel />
      </div>
    </div>
  );
}
