import { Avatar } from '@nemis-desktop/ui';

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning,';
  if (hour < 17) return 'Good afternoon,';
  return 'Good evening,';
}

export function DashboardGreeting({ name }: { name: string }) {
  const now = new Date();
  const formattedDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now);
  const [first, last] = name.split(' ');
  return (
    <div className="bg-primary p-6 rounded-card">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar firstName={first} lastName={last} role="generic" size={64} className="border-2 border-slate-400" alt={name} />
          <div>
            <p className="text-sm text-slate-400 font-semibold">{greeting(now.getHours())}</p>
            <h2 className="text-xl font-bold text-slate-100">{name}</h2>
            <p className="text-sm text-slate-400 font-semibold">School Principal</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-600 self-start lg:self-auto rounded">
          <span className="text-sm font-semibold text-slate-100">{formattedDate}</span>
        </div>
      </div>
    </div>
  );
}
