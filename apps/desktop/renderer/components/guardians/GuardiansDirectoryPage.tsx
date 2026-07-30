'use client';
import { useEffect, useMemo, useState } from 'react';
import { Avatar, Card } from '@nemis-desktop/ui';
import {
  Search,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  Users,
  UserCheck,
  Baby,
  Eye,
  Filter,
  ArrowRight,
} from 'lucide-react';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { useViewModel } from '@/hooks/use-view-model';
import { useSettingsViewModel } from '@/lib/presentation/hooks/school-admin';
import { buildGuardianRows, type GuardianRow } from './shared';
import { GuardianDrawer } from './GuardianDrawer';

const PAGE_SIZE = 15;

function ContactTypeChip({ isPrimary }: { isPrimary: boolean }) {
  return isPrimary ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
      <UserCheck className="w-3 h-3" /> Primary Contact
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
      Secondary Contact
    </span>
  );
}

function GridCard({ guardian, onView }: { guardian: GuardianRow; onView: (id: string) => void }) {
  return (
    <Card hoverable bordered={false}>
      <div className="flex -mx-6 -mt-6 -mb-6 min-h-[160px]">
        <div className="w-2/5 shrink-0 relative bg-slate-100">
          <Avatar
            firstName={guardian.firstName}
            lastName={guardian.lastName}
            role="parent"
            fill
            alt={`${guardian.firstName} ${guardian.lastName}`}
          />
        </div>
        <div className="flex-1 min-w-0 p-4 flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {guardian.firstName} {guardian.lastName}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{guardian.relationship}</p>
            </div>
            <span className="shrink-0 text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600">
              {guardian.children.length} {guardian.children.length === 1 ? 'child' : 'children'}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{guardian.phoneNumber}</span>
            </p>
            {guardian.email && (
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="truncate">{guardian.email}</span>
              </p>
            )}
          </div>
          <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
            <ContactTypeChip isPrimary={guardian.isPrimaryContact} />
            <button
              onClick={() => onView(guardian.id)}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 transition-colors shrink-0"
            >
              View <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function TableRow({ guardian, onView }: { guardian: GuardianRow; onView: (id: string) => void }) {
  return (
    <tr className="border-b border-gray-50 hover:bg-slate-50/50 transition-colors">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-5">
          <Avatar firstName={guardian.firstName} lastName={guardian.lastName} role="parent" size="sm" />
          <p className="text-sm font-semibold text-slate-800">
            {guardian.firstName} {guardian.lastName}
          </p>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <span className="text-[12px] text-slate-600">{guardian.relationship}</span>
      </td>
      <td className="px-5 py-3.5">
        <div className="space-y-0.5">
          <p className="text-[12px] text-slate-600 flex items-center gap-1.5">
            <Phone className="w-3 h-3 text-slate-400" />
            {guardian.phoneNumber}
          </p>
          {guardian.email && (
            <p className="text-[12px] text-slate-500 flex items-center gap-1.5">
              <Mail className="w-3 h-3 text-slate-400" />
              {guardian.email}
            </p>
          )}
        </div>
      </td>
      <td className="px-5 py-3.5">
        <span className="text-sm font-bold text-slate-800">{guardian.children.length}</span>
      </td>
      <td className="px-5 py-3.5">
        <ContactTypeChip isPrimary={guardian.isPrimaryContact} />
      </td>
      <td className="px-5 py-3.5">
        <button
          onClick={() => onView(guardian.id)}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          View Profile
        </button>
      </td>
    </tr>
  );
}

/** Parents & Guardians directory — mirrors portal-web's page (header band,
 * 3 stat cards, search/filter toolbar, grid/table toggle, drawer profile).
 * There is no dedicated guardian read API on this device yet, so the rows
 * are joined client-side from the raw `guardians`, `students` and
 * `student_guardians` offline collections. Fee-status data (shown on web)
 * has no backing source here and is intentionally omitted rather than
 * invented; "Primary Contact" — a real, stored flag — is shown instead. */
export function GuardiansDirectoryPage() {
  const settings = useSettingsViewModel();
  const profile = useViewModel(settings.store, (s) => s.profile);
  const schoolName =
    profile.status === 'success' || profile.status === 'refreshing' ? profile.data.name : 'School';

  const [rows, setRows] = useState<GuardianRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [relationship, setRelationship] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void settings.loadCurrentSchool();
    let cancelled = false;
    (async () => {
      try {
        const [guardians, students, links] = await Promise.all([
          sharedBridge.listSchoolAdminRecords({ collection: 'guardians', limit: 1000 }),
          sharedBridge.listSchoolAdminRecords({ collection: 'students', limit: 2000 }),
          sharedBridge.listSchoolAdminRecords({ collection: 'student_guardians', limit: 2000 }),
        ]);
        if (cancelled) return;
        setRows(buildGuardianRows(guardians.items, students.items, links.items));
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Unable to load offline guardian records.');
        setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const relationships = useMemo(
    () => Array.from(new Set((rows ?? []).map((g) => g.relationship))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((g) => {
      if (relationship && g.relationship !== relationship) return false;
      if (!q) return true;
      return (
        `${g.firstName} ${g.lastName}`.toLowerCase().includes(q) ||
        (g.email ?? '').toLowerCase().includes(q) ||
        g.phoneNumber.toLowerCase().includes(q)
      );
    });
  }, [rows, search, relationship]);

  useEffect(() => setPage(1), [search, relationship]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = rows?.find((g) => g.id === selectedId) ?? null;

  const totalGuardians = rows?.length ?? undefined;
  const totalChildrenCovered = rows ? new Set(rows.flatMap((g) => g.children.map((c) => c.id))).size : undefined;
  const primaryContacts = rows ? rows.filter((g) => g.isPrimaryContact).length : undefined;

  return (
    <div className="min-h-full bg-slate-100">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">{schoolName}</p>
          <h1 className="text-xl font-bold">Parents &amp; Guardians</h1>
        </div>
      </div>

      <div className="px-6 py-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Total Parents / Guardians" value={totalGuardians} icon={Users} sub="Linked to students" />
          <StatCard label="Total Children Covered" value={totalChildrenCovered} icon={Baby} sub="Active student links" />
          <StatCard label="Primary Contacts" value={primaryContacts} icon={UserCheck} sub="Marked as primary guardian" />
        </div>

        <div className="bg-white border rounded-lg border-slate-300 overflow-hidden">
          <div className="px-5 pt-4 pb-3 bg-secondary/20 border-b border-gray-100 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name, email, phone…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="text-xs border border-gray-300 px-4 py-1.5 rounded-full focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-600"
                >
                  <option value="">All Relationships</option>
                  {relationships.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {(relationship || search) && (
                  <button
                    onClick={() => {
                      setRelationship('');
                      setSearch('');
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 bg-slate-100 shrink-0">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 transition-colors ${
                    viewMode === 'grid' ? 'bg-primary text-slate-100' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 transition-colors ${
                    viewMode === 'table' ? 'bg-primary text-slate-100' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {rows === null ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-error">{error}</div>
          ) : pageItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-sm font-medium text-slate-500">No guardians found</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting your filters</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 p-5">
              {pageItems.map((g) => (
                <GridCard key={g.id} guardian={g} onView={setSelectedId} />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-accent-100">
                    {['Guardian', 'Relationship', 'Contact', 'Children', 'Contact Type', ''].map((h) => (
                      <th key={h} className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-900">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((g) => (
                    <TableRow key={g.id} guardian={g} onView={setSelectedId} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > 0 && (
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-gray-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p =
                    totalPages <= 5 ? i + 1 : Math.min(Math.max(page - 2 + i, 1), totalPages - 4 + i);
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors ${
                        p === page ? 'bg-slate-900 text-white' : 'border border-gray-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <GuardianDrawer guardian={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  sub: string;
}) {
  return (
    <Card hoverable bordered={false}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-slate-400" />
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      </div>
      <p className="text-4xl font-bold text-slate-900">{value === undefined ? '—' : value.toLocaleString()}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </Card>
  );
}
