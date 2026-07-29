import { Card } from '@nemis-desktop/ui';
import { Bell, CalendarCheck, BookOpen, Users, UserPlus } from 'lucide-react';
import ActivityItem from './ActivityItem';

export interface RecentlyEnrolledStudent {
  readonly id: string;
  readonly fullName: string;
  readonly admissionNumber: string;
}

/** Mirrors portal-web's RecentActivityFeed: recently enrolled students become
 * "New Student Enrolled" entries; when there are none yet, an honest set of
 * system-status placeholders is shown instead — never fabricated activity. */
export default function RecentActivityFeed({
  recentlyEnrolled = [],
}: {
  recentlyEnrolled?: readonly RecentlyEnrolledStudent[];
}) {
  const activities =
    recentlyEnrolled.length > 0
      ? recentlyEnrolled.slice(0, 5).map((student) => ({
          id: `student-${student.id}`,
          icon: UserPlus,
          title: 'New Student Enrolled',
          description: `${student.fullName} (${student.admissionNumber})`,
          time: 'Recently',
          variant: 'success' as const,
        }))
      : [
          {
            id: 'placeholder-1',
            icon: CalendarCheck,
            title: 'Attendance Tracking Active',
            description: 'Daily attendance monitoring is enabled',
            time: 'Today',
            variant: 'info' as const,
          },
          {
            id: 'placeholder-2',
            icon: BookOpen,
            title: 'Academic Year in Progress',
            description: 'Classes are in session',
            time: 'Ongoing',
            variant: 'default' as const,
          },
          {
            id: 'placeholder-3',
            icon: Users,
            title: 'System Ready',
            description: 'All systems operational',
            time: 'Now',
            variant: 'success' as const,
          },
        ];

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-dark flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" /> Recent Activity
        </h2>
        <p className="text-sm text-gray-600 mt-1">Latest updates and activities</p>
      </div>
      <div className="space-y-0">
        {activities.map((activity) => (
          <ActivityItem
            key={activity.id}
            icon={activity.icon}
            title={activity.title}
            description={activity.description}
            time={activity.time}
            variant={activity.variant}
          />
        ))}
      </div>
    </Card>
  );
}
