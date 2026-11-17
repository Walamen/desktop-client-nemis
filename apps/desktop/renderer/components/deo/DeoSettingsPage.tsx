'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, LockKeyhole, Save, WifiOff } from 'lucide-react';
import { Spinner } from '@nemis-desktop/ui';
import { settingsFormError } from '@nemis-desktop/presentation';
import { useDeoSettingsViewModel } from '@/lib/presentation/hooks/deo';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { parseIpcError } from '@/lib/errors/parseIpcError';
import { deoBridge } from '@/services/nemis-bridge/deo';

interface FormState {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  officeAddress: string;
  currentPassword: string;
  newPassword: string;
}

const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  phoneNumber: '',
  officeAddress: '',
  currentPassword: '',
  newPassword: '',
};

const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2';
const INPUT =
  'w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-50 disabled:text-gray-500';

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={LABEL}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Banner() {
  return (
    <div className="bg-slate-900 text-white px-6 py-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">DEO Portal</p>
      <h1 className="text-xl font-bold text-white">Settings</h1>
    </div>
  );
}

/** DEO Settings, ported from portal-web components/deo/settings/DeoSettingsPanel.tsx:
 * the profile from this device; the office address and saving need a connection
 * (docs/superpowers/specs/2026-11-17-deo-settings-design.md). */
export function DeoSettingsPage() {
  const vm = useDeoSettingsViewModel();
  const state = useViewModel(vm.store, (s) => s.settings);
  const connectivity = useConnectivityStore();
  const online = useViewModel(connectivity.store, (s) => s.isOnline);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [addressLoaded, setAddressLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useRevalidateOnSync(() => {
    void vm.load();
  }, [vm]);

  const data = state.status === 'success' || state.status === 'refreshing' ? state.data : null;
  const profile = data?.profile ?? null;

  // The synced profile fills the form; a later sync refreshes it, but never
  // over edits the user has not saved yet.
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!profile || dirtyRef.current) return;
    setForm((current) => ({
      ...current,
      firstName: profile.firstName,
      lastName: profile.lastName,
      phoneNumber: profile.phoneNumber ?? '',
    }));
  }, [profile]);

  // The office address is not synced: fetch it whenever we are online.
  useEffect(() => {
    if (!online || !data?.districtId) return;
    let cancelled = false;
    deoBridge
      .getRemoteSettings()
      .then((result) => {
        if (cancelled) return;
        setForm((current) => ({ ...current, officeAddress: result.data.officeAddress ?? '' }));
        setAddressLoaded(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [online, data?.districtId]);

  const set = (field: keyof FormState) => (event: { target: { value: string } }) => {
    dirtyRef.current = true;
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSave = async () => {
    setFeedback(null);
    const error = settingsFormError(form);
    if (error) {
      setFeedback({ type: 'error', text: error });
      return;
    }
    setSaving(true);
    try {
      await deoBridge.saveSettings({
        firstName: form.firstName,
        lastName: form.lastName,
        phoneNumber: form.phoneNumber,
        // Never overwrite an address this page could not read.
        ...(addressLoaded ? { officeAddress: form.officeAddress } : {}),
        ...(form.newPassword ? { currentPassword: form.currentPassword, newPassword: form.newPassword } : {}),
      });
      setForm((current) => ({ ...current, currentPassword: '', newPassword: '' }));
      setFeedback({ type: 'success', text: 'Settings saved successfully.' });
      dirtyRef.current = false;
      await vm.load();
    } catch (saveError) {
      setFeedback({
        type: 'error',
        text:
          parseIpcError(saveError)?.message ||
          'Unable to save settings right now. Please check your inputs and try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (state.status === 'error') {
    return (
      <div className="min-h-screen bg-slate-100 font-['Sora']">
        <Banner />
        <div className="px-6 py-6">
          <div role="alert" className="bg-white border border-slate-300 rounded-2xl p-12 text-center">
            <AlertTriangle className="w-10 h-10 text-error mx-auto mb-3" aria-hidden />
            <p className="text-sm text-slate-700 font-medium">Unable to load settings.</p>
            <button type="button" onClick={() => void vm.load()} className="mt-3 text-sm underline text-error">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-100 font-['Sora']">
        <Banner />
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (data.districtId === null) {
    return (
      <div className="min-h-screen bg-slate-100 font-['Sora'] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-pending mx-auto mb-3" aria-hidden />
          <p className="text-sm text-slate-600">No district assigned to your account.</p>
        </div>
      </div>
    );
  }

  const fullName = [form.firstName, form.lastName].filter(Boolean).join(' ').trim();
  const place = [data.district?.name, data.county?.name].filter(Boolean).join(' · ');
  const locked = !online || saving;

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <Banner />
      <form
        className="px-6 py-6 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Settings</h2>
          <p className="text-sm text-gray-600">{place ? `DEO Portal · ${place}` : 'DEO Portal'}</p>
        </div>

        {!online ? (
          <div role="status" className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <WifiOff className="w-4 h-4" aria-hidden />
            Settings need a connection to save.
          </div>
        ) : null}

        {feedback ? (
          <div
            role={feedback.type === 'error' ? 'alert' : 'status'}
            className={`rounded-2xl border px-4 py-3 text-sm ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {feedback.text}
          </div>
        ) : null}

        <div className="bg-white border border-slate-300 rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Profile Information</h3>
          </div>
          <div className="px-6 py-6">
            <div className="flex flex-col md:flex-row md:items-center gap-5 mb-6">
              <div className="w-24 h-24 rounded-3xl bg-primary flex items-center justify-center text-white text-3xl font-bold">
                {fullName.charAt(0) || 'D'}
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">{fullName}</p>
                <p className="text-lg text-gray-600 mt-1">District Education Officer</p>
                {data.district ? (
                  <span className="inline-flex mt-3 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {data.district.name}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="First Name" htmlFor="deo-first-name">
                <input id="deo-first-name" value={form.firstName} onChange={set('firstName')} disabled={locked} className={INPUT} />
              </Field>
              <Field label="Last Name" htmlFor="deo-last-name">
                <input id="deo-last-name" value={form.lastName} onChange={set('lastName')} disabled={locked} className={INPUT} />
              </Field>
              <Field label="Email" htmlFor="deo-email">
                <input id="deo-email" value={profile?.email ?? ''} disabled className={INPUT} />
              </Field>
              <Field label="Phone" htmlFor="deo-phone">
                <input id="deo-phone" value={form.phoneNumber} onChange={set('phoneNumber')} disabled={locked} className={INPUT} />
              </Field>
              <Field label="District" htmlFor="deo-district">
                <input id="deo-district" value={data.district?.name ?? ''} disabled className={INPUT} />
              </Field>
              <Field label="County" htmlFor="deo-county">
                <input id="deo-county" value={data.county?.name ?? ''} disabled className={INPUT} />
              </Field>
            </div>

            <div className="mt-5">
              <Field label="Office Address" htmlFor="deo-office-address">
                <textarea
                  id="deo-office-address"
                  value={form.officeAddress}
                  onChange={set('officeAddress')}
                  disabled={locked || !addressLoaded}
                  maxLength={255}
                  rows={3}
                  className={INPUT}
                />
              </Field>
              {!addressLoaded ? <p className="mt-1 text-xs text-gray-500">Loads when you are online.</p> : null}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-300 rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 flex items-center gap-3">
            <LockKeyhole className="w-5 h-5 text-gray-500" aria-hidden />
            <h3 className="text-lg font-semibold text-gray-900">Security</h3>
          </div>
          <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Current Password" htmlFor="deo-current-password">
              <input
                id="deo-current-password"
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={set('currentPassword')}
                disabled={locked}
                placeholder="Required only when changing password"
                className={INPUT}
              />
            </Field>
            <Field label="New Password" htmlFor="deo-new-password">
              <input
                id="deo-new-password"
                type="password"
                autoComplete="new-password"
                value={form.newPassword}
                onChange={set('newPassword')}
                disabled={locked}
                placeholder="Leave blank to keep your current password"
                className={INPUT}
              />
            </Field>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={locked}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Spinner size="sm" /> : <Save className="w-4 h-4" aria-hidden />}
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
