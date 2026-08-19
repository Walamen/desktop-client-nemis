'use client';

import { useMemo, useState } from 'react';
import {
  School, Users, BookOpen, User, Phone, Mail, MapPin,
} from 'lucide-react';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { Avatar, Card, ErrorState, Skeleton } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import {
  useAcademicYearViewModel,
  useTeachingAssignmentViewModel,
} from '@/lib/presentation/hooks/school-admin';
import { useTeacherDashboardViewModel } from '@/lib/presentation/hooks/teacher';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { StatCard } from '@/components/dashboard/StatCard';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { human, rows } from '@/components/teachers/shared';

interface StaffMember {
  id: string;
  userId?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  position: string;
  isActive: boolean;
  photoUrl?: string;
  phoneNumber?: string;
  email?: string;
  employeeNumber?: string;
}

function toStaffMember(r: SchoolAdminRecord): StaffMember {
  const firstName = r.firstName != null ? String(r.firstName) : '';
  const lastName = r.lastName != null ? String(r.lastName) : '';
  return {
    id: String(r.id),
    userId: r.userId != null ? String(r.userId) : undefined,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    position: r.position != null ? String(r.position) : '',
    isActive: Boolean(r.isActive),
    photoUrl: r.photoUrl != null ? String(r.photoUrl) : undefined,
    phoneNumber: r.phoneNumber != null ? String(r.phoneNumber) : undefined,
    email: r.email != null ? String(r.email) : undefined,
    employeeNumber: r.employeeNumber != null ? String(r.employeeNumber) : undefined,
  };
}

interface SchoolView {
  name: string;
  code: string;
  typeLabel: string;
  ownershipLabel: string;
  approvalLabel: string;
  address: string;
}

function toSchoolView(r: SchoolAdminRecord): SchoolView {
  const address = [r.street, r.communityTown]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(', ');
  return {
    name: r.name != null ? String(r.name) : '',
    code: r.code != null ? String(r.code) : '',
    typeLabel: r.type != null ? human(String(r.type)) : '',
    ownershipLabel: r.ownership != null ? human(String(r.ownership)) : '',
    approvalLabel: r.approvalStatus != null ? human(String(r.approvalStatus)) : '',
    address: address === '' ? '—' : address,
  };
}

interface SchoolSnapshot {
  school?: SchoolView;
  totalStudents?: number;
  totalClasses?: number;
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-5 h-5 mt-0.5 text-primary shrink-0">{icon}</div>
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-sm text-slate-500">{value || 'Not available'}</p>
      </div>
    </div>
  );
}

/** Read-only institution snapshot for the signed-in teacher — mirrors the
 * portal-web "My School" page (school header, headline stats, principal,
 * contact, own teaching summary, staff directory) but sourced entirely from
 * this device's offline data via the shared view-model/bridge layer instead
 * of a live API call. Fields the desktop domain model doesn't track yet
 * (e.g. an institution-level phone/email) are represented through the
 * closest real source — the principal's own contact record — rather than
 * fabricated.
 *
 * Own-profile data (employee number, position, staffId for the assignments
 * lookup) comes from the generic `staff` schoolAdmin collection (open to
 * TEACHER, see SchoolAdminModuleService's per-role allowlist) rather than
 * TEACHER_LIST/TEACHER_GET_PROFILE, which authorizeChannel.ts restricts to
 * INSTITUTION_ADMIN — mirrors the id-resolution pattern in
 * government/teacher/page.tsx (users.id vs staff.id are different spaces).
 * `staff` itself is restricted server-side to the signed-in teacher's own
 * row (restrictTeacherSnapshot), so the Staff Directory instead reads
 * `staff_directory`: a separate, institution-wide, minimal (name/position/
 * photo/email/phone only) projection that isn't restricted to self — see
 * desktop-provisioning.service.ts. It deliberately excludes the sensitive
 * fields `staff` carries (nationalId, dateOfBirth, address, qualifications,
 * approvalNotes) since those shouldn't sync to every teacher's device just
 * to render a directory.
 * The Principal card is NOT "whichever staff row has position=PRINCIPAL" —
 * that's a different id space (staff.id) from who actually holds the
 * INSTITUTION_ADMIN role (users.id), and a school's admin account often
 * has no `staff` row at all. It reads `institution_admin` instead, which
 * mirrors web's teacher.service.ts getSchoolInfo() principalOrg query.
 * The school header/stats work the same way: the `institutions`/`students`/
 * `classes` collections (also TEACHER-open) stand in for
 * SettingsViewModel.loadCurrentSchool() (SCHOOL_GET_SUMMARY) and
 * DashboardViewModel.loadOverview() (DASHBOARD_GET_OVERVIEW), both of which
 * authorizeChannel.ts restricts to INSTITUTION_ADMIN. */
export default function MySchoolPage() {
  const currentUser = useCurrentUserViewModel();
  const academicYear = useAcademicYearViewModel();
  const teacherDashboard = useTeacherDashboardViewModel();
  const teachingAssignments = useTeachingAssignmentViewModel();

  const user = useViewModel(currentUser.store, (s) => s.user);
  const year = useViewModel(academicYear.store, (s) => s.current);
  const teacherStats = useViewModel(teacherDashboard.store, (s) => s.dashboard);
  const assignments = useViewModel(teachingAssignments.store, (s) => s.assignments);

  const [staffRecords, setStaffRecords] = useState<readonly SchoolAdminRecord[]>([]);

  const [directoryRecords, setDirectoryRecords] = useState<readonly SchoolAdminRecord[]>([]);
  const [directoryStatus, setDirectoryStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const [adminRecords, setAdminRecords] = useState<readonly SchoolAdminRecord[]>([]);
  const [adminStatus, setAdminStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const [schoolSnapshot, setSchoolSnapshot] = useState<SchoolSnapshot>({});
  const [schoolStatus, setSchoolStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [schoolReloadToken, setSchoolReloadToken] = useState(0);

  const userId = user.status === 'success' ? user.data.id : undefined;

  useRevalidateOnSync(() => void teacherDashboard.load(), [teacherDashboard]);

  useRevalidateOnSync(() => {
    if (!userId) return;
    let cancelled = false;
    void sharedBridge.listSchoolAdminRecords({ collection: 'staff', limit: 250 }).then((result) => {
      if (cancelled) return;
      setStaffRecords(result.items);
    }).catch(() => {
      // Own-profile fields (employee number, position) just fall back to
      // '—' below on failure — no dedicated loading/error UI for this
      // one, matching how the rest of this page degrades silently.
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useRevalidateOnSync(() => {
    if (!userId) return;
    let cancelled = false;
    setDirectoryStatus('loading');
    void sharedBridge.listSchoolAdminRecords({ collection: 'staff_directory', limit: 250 }).then((result) => {
      if (cancelled) return;
      setDirectoryRecords(result.items);
      setDirectoryStatus('success');
    }).catch(() => {
      if (!cancelled) setDirectoryStatus('error');
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useRevalidateOnSync(() => {
    if (!userId) return;
    let cancelled = false;
    setAdminStatus('loading');
    void sharedBridge.listSchoolAdminRecords({ collection: 'institution_admin', limit: 1 }).then((result) => {
      if (cancelled) return;
      setAdminRecords(result.items);
      setAdminStatus('success');
    }).catch(() => {
      if (!cancelled) setAdminStatus('error');
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useRevalidateOnSync(() => {
    if (!userId) return;
    let cancelled = false;
    setSchoolStatus('loading');
    void Promise.all([
      sharedBridge.listSchoolAdminRecords({ collection: 'institutions', limit: 1 }),
      sharedBridge.listSchoolAdminRecords({ collection: 'students', limit: 1 }),
      sharedBridge.listSchoolAdminRecords({ collection: 'classes', limit: 1 }),
    ]).then(([institutions, students, classes]) => {
      if (cancelled) return;
      const record = institutions.items[0];
      setSchoolSnapshot({
        school: record ? toSchoolView(record) : undefined,
        totalStudents: students.total,
        totalClasses: classes.total,
      });
      setSchoolStatus('success');
    }).catch(() => {
      if (!cancelled) setSchoolStatus('error');
    });
    return () => {
      cancelled = true;
    };
  }, [userId, schoolReloadToken]);

  const staff = useMemo(() => staffRecords.map(toStaffMember), [staffRecords]);
  const own = staff.find((t) => t.userId === userId);
  const staffId = own?.id;

  useRevalidateOnSync(() => {
    if (staffId) void teachingAssignments.load(staffId);
  }, [staffId, teachingAssignments]);

  const directory = useMemo(() => directoryRecords.map(toStaffMember), [directoryRecords]);
  const directoryLoading = directoryStatus === 'idle' || directoryStatus === 'loading';
  const otherStaff = directory;

  const admin = useMemo(() => adminRecords.map(toStaffMember), [adminRecords]);
  const adminLoading = adminStatus === 'idle' || adminStatus === 'loading';
  const principal = admin[0];

  const myAssignments = rows(assignments);
  const subjectsTaught = Array.from(
    new Set(myAssignments.map((a) => a.subjectName).filter((v): v is string => Boolean(v))),
  );
  const assignedClasses = Array.from(
    new Set(myAssignments.map((a) => `${a.className}${a.section ? ` — ${a.section}` : ''}`)),
  );

  const school = schoolSnapshot.school;
  const teacherStatsReady = teacherStats.status === 'success' || teacherStats.status === 'refreshing';

  const { totalStudents, totalClasses } = schoolSnapshot;
  const totalTeachers = teacherStatsReady ? teacherStats.data.totalTeachers : undefined;

  if (schoolStatus === 'error') {
    return (
      <div className="min-h-full bg-slate-100 px-6 py-6">
        <ErrorState
          message="Something went wrong while loading. Please try again."
          onRetry={() => setSchoolReloadToken((t) => t + 1)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-100">
      <div className="px-6 py-6 space-y-5">
        {/* School Information */}
        <div className="bg-white border border-slate-300 rounded-card p-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-20 h-20 bg-primary rounded-lg flex items-center justify-center shrink-0">
              <School className="w-10 h-10 text-white" />
            </div>
            <div className="flex-1">
              {school ? (
                <>
                  <h2 className="text-2xl font-bold text-slate-900 mb-1">{school.name}</h2>
                  <p className="text-sm text-slate-500">
                    {school.typeLabel} • {school.ownershipLabel} • {school.approvalLabel}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">School code {school.code}</p>
                </>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-7 w-64" />
                  <Skeleton className="h-4 w-48" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard label="Total Students" value={totalStudents} icon={Users} />
          <StatCard label="Total Teachers" value={totalTeachers} icon={Users} />
          <StatCard label="Total Classes" value={totalClasses} icon={BookOpen} />
        </div>

        {/* Principal + Contact */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="School Principal">
            {adminLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : principal ? (
              <div className="flex items-start gap-4">
                <Avatar
                  src={principal.photoUrl}
                  firstName={principal.firstName}
                  lastName={principal.lastName}
                  role="teacher"
                  size="lg"
                />
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{principal.fullName}</h3>
                  <p className="text-sm text-slate-500">{human(principal.position)}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <User className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No principal assigned</p>
              </div>
            )}
          </Card>

          <Card title="Contact Information">
            <div className="space-y-4">
              <InfoRow
                icon={<MapPin className="w-5 h-5" />}
                label="Address"
                value={school?.address}
              />
              {adminLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : principal ? (
                <>
                  <InfoRow icon={<Phone className="w-5 h-5" />} label="Phone" value={principal.phoneNumber} />
                  <InfoRow icon={<Mail className="w-5 h-5" />} label="Email" value={principal.email} />
                </>
              ) : (
                <p className="text-sm text-slate-500">No additional contact details available.</p>
              )}
            </div>
          </Card>
        </div>

        {/* My Teaching Information */}
        <Card title="My Teaching Information">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Subjects</p>
              <p className="text-base font-semibold text-slate-900">
                {subjectsTaught.length > 0 ? subjectsTaught.join(', ') : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Employee ID</p>
              <p className="text-base font-semibold text-slate-900">
                {own?.employeeNumber || '—'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Assigned Classes</p>
              <p className="text-base font-semibold text-slate-900">
                {assignedClasses.length > 0 ? assignedClasses.join(', ') : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Academic Year</p>
              <p className="text-base font-semibold text-slate-900">
                {year.status === 'success' ? year.data.code : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Position</p>
              <p className="text-base font-semibold text-slate-900">
                {own ? human(own.position) : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">School Code</p>
              <p className="text-base font-semibold text-slate-900">{school ? school.code : '—'}</p>
            </div>
          </div>
        </Card>

        {/* Staff Directory */}
        <Card title="Staff Directory">
          {directoryLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : otherStaff.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No staff members found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {otherStaff.map((staffMember) => (
                <div
                  key={staffMember.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50"
                >
                  <Avatar
                    src={staffMember.photoUrl}
                    firstName={staffMember.firstName}
                    lastName={staffMember.lastName}
                    role="teacher"
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-900 truncate">{staffMember.fullName}</p>
                    <p className="text-xs text-slate-500 truncate">{human(staffMember.position)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
