'use client';

import Link from 'next/link';
import { Card, Button, Spinner } from '@nemis-desktop/ui';
import { useCountySettingsViewModel } from '@/lib/presentation/hooks/county';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

/** Exact port of portal-web government/county/settings/page.tsx. The profile,
 * security and preference controls are placeholders there too ("coming
 * soon"); only County Information is real, read from this device. */
export function CountySettingsPage() {
  const vm = useCountySettingsViewModel();
  const settings = useViewModel(vm.store, (s) => s.settings);

  useRevalidateOnSync(() => {
    void vm.load();
  }, []);

  if (settings.status === 'idle' || settings.status === 'loading') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-gray-600">Loading county data...</p>
        </div>
      </div>
    );
  }

  const data = settings.status === 'success' || settings.status === 'refreshing' ? settings.data : null;
  const county = data?.county ?? null;

  return (
    <div className="space-y-6 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 font-heading text-neutral-dark mb-2">Settings</h1>
          <p className="text-body text-gray-600">Manage your account and county portal preferences</p>
        </div>
        <Link href="/government/county">
          <Button variant="secondary">Back to Dashboard</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Profile Settings" className="lg:col-span-2">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
              <input
                type="text"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="County Admin"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
              <input
                type="email"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="admin@grandbassa.gov.lr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
              <input
                type="tel"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="+231 XXX XXXX"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">County</label>
              <input
                type="text"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100"
                value={county?.name || ''}
                disabled
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button variant="primary">Save Changes</Button>
              <Button variant="secondary">Cancel</Button>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Security">
            <div className="space-y-3">
              <Button variant="secondary" className="w-full">
                Change Password
              </Button>
              <Button variant="secondary" className="w-full">
                Two-Factor Auth
              </Button>
              <Button variant="secondary" className="w-full">
                Login History
              </Button>
            </div>
          </Card>

          <Card title="Preferences">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Email Notifications</span>
                <input type="checkbox" className="w-5 h-5 text-primary" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Weekly Reports</span>
                <input type="checkbox" className="w-5 h-5 text-primary" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">SMS Alerts</span>
                <input type="checkbox" className="w-5 h-5 text-primary" />
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card title="County Information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-neutral-dark mb-3">County Details</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>
                <strong>County:</strong> {county?.name || 'N/A'}
              </li>
              <li>
                <strong>Code:</strong> {county?.code || 'N/A'}
              </li>
              <li>
                <strong>Districts:</strong> {data?.districtCount ?? 0}
              </li>
              <li>
                <strong>Schools:</strong> {data?.schoolCount ?? 0}
              </li>
              <li>
                <strong>Status:</strong>{' '}
                <span className={county?.isActive ? 'text-success' : 'text-error'}>
                  {county?.isActive ? 'Active' : 'Inactive'}
                </span>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-neutral-dark mb-3">Contact Information</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>
                <strong>Office:</strong> {county?.name} County Education Office
              </li>
              <li>
                <strong>County Code:</strong> {county?.code || 'N/A'}
              </li>
              <li>
                <strong>Created:</strong>{' '}
                {county?.createdAt ? new Date(county.createdAt).toLocaleDateString() : 'N/A'}
              </li>
              <li>
                <strong>Last Updated:</strong>{' '}
                {county?.updatedAt ? new Date(county.updatedAt).toLocaleDateString() : 'N/A'}
              </li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
