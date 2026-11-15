'use client';

import { Avatar } from '@nemis-desktop/ui';

interface DEOBannerProps {
  firstName?: string | null;
  lastName?: string | null;
  userName: string;
  /** "Good morning" / "Good afternoon" / "Good evening". */
  greeting: string;
  /** Title, district, county and date, already joined (see bannerLine). */
  line: string;
}

/** Ported from portal-web components/deo/DEOBanner.tsx. */
export function DEOBanner({ firstName, lastName, userName, greeting, line }: DEOBannerProps) {
  return (
    <div className="flex flex-col lg:flex-row items-start justify-between gap-6">
      <div className="flex items-start space-x-6">
        <div className="border-4 border-blue-900 rounded-full w-16 h-16">
          <Avatar src={null} firstName={firstName} lastName={lastName} role="deo" size={64} alt="Profile Photo" />
        </div>
        <div>
          <p className="text-sm text-white/80 font-semibold">{greeting},</p>
          <h2 className="text-2xl font-semibold mb-1">{userName}</h2>
          <p className="text-sm text-white/90 font-semibold">{line}</p>
        </div>
      </div>
    </div>
  );
}
