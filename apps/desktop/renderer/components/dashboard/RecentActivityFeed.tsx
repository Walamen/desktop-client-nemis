import { Card } from '@nemis-desktop/ui';
import { Bell, CalendarCheck, BookOpen, Users } from 'lucide-react';
import ActivityItem from './ActivityItem';

export default function RecentActivityFeed() {
  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-dark flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" /> Recent Activity
        </h2>
        <p className="text-sm text-gray-600 mt-1">Sample activity — live feed arrives with sync</p>
      </div>
      <div className="space-y-0">
        <ActivityItem icon={CalendarCheck} title="Attendance Tracking Active" description="Daily attendance monitoring is enabled" time="Today" variant="info" />
        <ActivityItem icon={BookOpen} title="Academic Year in Progress" description="Classes are in session" time="Ongoing" variant="default" />
        <ActivityItem icon={Users} title="System Ready" description="All systems operational" time="Now" variant="success" />
      </div>
    </Card>
  );
}
