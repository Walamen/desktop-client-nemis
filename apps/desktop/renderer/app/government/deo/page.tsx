import { ScopedPortalDashboard } from '@/components/dashboard/ScopedPortalDashboard';
import { YearClosuresPanel } from '@/components/year-closures/YearClosuresPanel';

export default function Page() {
  return (
    <>
      <ScopedPortalDashboard title="DEO portal" description="District-authorized schools and operational data are available in this offline workspace." />
      <div className="px-8 pb-8">
        <div className="mx-auto max-w-5xl">
          <YearClosuresPanel />
        </div>
      </div>
    </>
  );
}
