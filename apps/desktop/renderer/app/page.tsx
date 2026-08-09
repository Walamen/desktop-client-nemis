'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  CloudDownload,
  Database,
  Laptop,
  LockKeyhole,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { desktopPortalRoute, type ProvisioningStatus } from '@nemis-desktop/types';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { usePresentation } from '@/lib/presentation/presentation-provider';

export default function ProvisioningPage() {
  const router = useRouter();
  const layer = usePresentation();
  const [status, setStatus] = useState<ProvisioningStatus | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void sharedBridge
      .getProvisioningStatus()
      .then((next) => {
        setStatus(next);
        setShowLogin(next.authentication !== 'authenticated');
        if (next.isProvisioned && next.user) {
          router.replace(desktopPortalRoute(next.user.role) ?? '/');
        }
      })
      .catch(() => setError('The secure desktop service could not be initialized. Restart NEMIS Desktop.'));
  }, [router]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await sharedBridge.authenticate(email, password);
      setPassword('');
      setStatus(next);
      setShowLogin(false);
      if (next.isProvisioned && next.user) {
        // RootProviders' bootstrap.run() already fired once, at initial app
        // load, before this login ever happened — against a workspace that
        // was still inactive, every task legitimately came back empty (see
        // the doc comment on that effect). Nothing else re-triggers it, so
        // without this, currentUser/school/dashboard stay stuck at that
        // premature, empty result until a full reload remounts RootProviders
        // and reruns bootstrap against the now-active workspace. A returning,
        // already-provisioned user hits this on every login, not just the
        // one-time provisioning flow (which separately runs bootstrap again
        // below for the same reason).
        await layer.bootstrap.run();
        router.replace(desktopPortalRoute(next.user.role) ?? '/');
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '';
      setError(
        message.includes('UNAUTHORIZED')
          ? 'The email or password is incorrect.'
          : message.includes('FORBIDDEN')
            ? 'This account is not authorized to provision a school device.'
            : 'NEMIS could not sign you in. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function provision() {
    setBusy(true);
    setError(null);
    const poll = window.setInterval(() => {
      void sharedBridge.getProvisioningStatus().then(setStatus);
    }, 400);
    try {
      const next = await sharedBridge.startProvisioning();
      setStatus(next);
      if (next.isProvisioned && next.user) {
        // Same reasoning as login() above — the workspace only just became
        // active, so the premature bootstrap pass at app load found nothing.
        await layer.bootstrap.run();
        router.replace(desktopPortalRoute(next.user.role) ?? '/');
      }
    } catch {
      const latest = await sharedBridge.getProvisioningStatus().catch(() => null);
      if (latest) setStatus(latest);
      setError(latest?.message ?? 'Provisioning could not continue. No local data was changed.');
    } finally {
      window.clearInterval(poll);
      setBusy(false);
    }
  }

  if (!status) return <LoadingScreen />;

  return (
    <main className="min-h-screen bg-[#071a33] text-white overflow-hidden">
      <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_20%_15%,#167c80_0,transparent_34%),radial-gradient(circle_at_85%_80%,#0c4a6e_0,transparent_32%)]" />
      <div className="relative min-h-screen grid lg:grid-cols-[1.05fr_.95fr]">
        <section className="px-8 py-10 lg:px-16 lg:py-14 flex flex-col">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#16a6a0]">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <p className="font-bold tracking-wide">NEMIS Desktop</p>
              <p className="text-xs text-slate-300">National Education Management Information System</p>
            </div>
          </div>

          <div className="my-auto max-w-xl py-14">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-cyan-100">
              <Wifi className="h-3.5 w-3.5" /> One-time secure setup
            </span>
            <h1 className="mt-6 text-4xl lg:text-6xl font-semibold leading-[1.08]">
              Your school, ready to work <span className="text-[#43d4c9]">offline.</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-300">
              Connect this computer to the national platform, verify your school, and prepare the
              encrypted local database for reliable daily work.
            </p>
            <div className="mt-10 grid sm:grid-cols-3 gap-4 text-sm">
              <Feature icon={<LockKeyhole />} title="Protected" text="OS-encrypted session" />
              <Feature icon={<CloudDownload />} title="Complete" text="Verified school data" />
              <Feature icon={<Database />} title="Offline-first" text="Local encrypted storage" />
            </div>
          </div>
          <p className="text-xs text-slate-400">Device {status.device.name} · NEMIS {status.device.appVersion}</p>
        </section>

        <section className="bg-slate-200 text-slate-900  flex items-center">
          <div className="w-full max-w-lg mx-auto ">
            {status.stage === 'backend_gap' ? (
              <BackendGap status={status} onLogout={async () => setStatus(await sharedBridge.logout())} />
            ) : busy && status.authentication === 'authenticated' ? (
              <ProgressCard status={status} />
            ) : status.stage === 'ready' ? (
              <OfflineReady />
            ) : !showLogin && status.stage === 'welcome' ? (
              <Welcome onContinue={() => setShowLogin(true)} />
            ) : showLogin || status.authentication !== 'authenticated' ? (
              <LoginForm
                email={email}
                password={password}
                busy={busy}
                error={error}
                onEmail={setEmail}
                onPassword={setPassword}
                onSubmit={login}
                onBack={() => {
                  setShowLogin(false);
                  setError(null);
                }}
              />
            ) : (
              <Verification status={status} busy={busy} error={error} onContinue={provision} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Welcome({ onContinue }: { onContinue: () => void }) {
  return (
    <div>
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
        <Laptop className="h-7 w-7" />
      </div>
      <p className="mt-8 text-sm font-semibold text-cyan-700">INITIAL DEVICE PROVISIONING</p>
      <h2 className="mt-2 text-3xl font-semibold">Welcome to NEMIS Desktop</h2>
      <p className="mt-4 leading-7 text-slate-600">
        You will need an active Institution Administrator account and a stable internet connection
        for this one-time setup.
      </p>
      <button onClick={onContinue} className="mt-8 w-full rounded-xl bg-[#0d6570] px-5 py-3.5 font-semibold text-white hover:bg-[#0a5660]">
        Begin secure setup <ArrowRight className="ml-2 inline h-4 w-4" />
      </button>
    </div>
  );
}

interface LoginProps {
  email: string; password: string; busy: boolean; error: string | null;
  onEmail(value: string): void; onPassword(value: string): void;
  onSubmit(event: FormEvent): void; onBack(): void;
}

function LoginForm(props: LoginProps) {
  return (
    <form onSubmit={props.onSubmit}>
      <p className="text-sm font-semibold text-cyan-700">AUTHENTICATE</p>
      <h2 className="mt-2 text-3xl font-semibold">Sign in to your school</h2>
      <p className="mt-3 text-slate-600">Use the same administrator account as the national NEMIS platform.</p>
      <label className="mt-8 block text-sm font-semibold">Email address</label>
      <input type="email" autoComplete="username" required value={props.email} onChange={(e) => props.onEmail(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-cyan-700 focus:outline-none" />
      <label className="mt-5 block text-sm font-semibold">Password</label>
      <input type="password" autoComplete="current-password" required value={props.password} onChange={(e) => props.onPassword(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-cyan-700 focus:outline-none" />
      {props.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{props.error}</p>}
      <button disabled={props.busy} className="mt-7 w-full rounded-xl bg-[#0d6570] px-5 py-3.5 font-semibold text-white disabled:opacity-60">
        {props.busy ? 'Signing in securely…' : 'Sign in and verify'}
      </button>
      <button type="button" onClick={props.onBack} className="mt-4 w-full text-sm text-slate-500">Back</button>
      <p className="mt-6 text-center text-xs text-slate-500">Your password is sent only to NEMIS and is never stored on this computer.</p>
    </form>
  );
}

function Verification({ status, busy, error, onContinue }: { status: ProvisioningStatus; busy: boolean; error: string | null; onContinue(): void }) {
  return (
    <div>
      <CheckCircle2 className="h-14 w-14 text-emerald-600" />
      <p className="mt-7 text-sm font-semibold text-emerald-700">IDENTITY VERIFIED</p>
      <h2 className="mt-2 text-3xl font-semibold">Confirm this device</h2>
      <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-5 text-sm">
        <Row label="Administrator" value={`${status.user?.firstName} ${status.user?.lastName}`} />
        <Row label="School" value={status.user?.institutionName ?? status.user?.institutionId ?? '—'} />
        <Row label="Device" value={status.device.name} />
        <Row label="Operating system" value={`${status.device.platform} ${status.device.osVersion}`} />
      </div>
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      <button onClick={onContinue} disabled={busy} className="mt-7 w-full rounded-xl bg-[#0d6570] px-5 py-3.5 font-semibold text-white disabled:opacity-60">
        {busy ? 'Checking backend capabilities…' : 'Register device and download'}
      </button>
    </div>
  );
}

function BackendGap({ status, onLogout }: { status: ProvisioningStatus; onLogout(): void }) {
  return (
    <div>
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-700"><ShieldCheck /></div>
      <p className="mt-7 text-sm font-semibold text-amber-700">SAFE PAUSE</p>
      <h2 className="mt-2 text-3xl font-semibold">Backend support is required</h2>
      <p className="mt-4 leading-7 text-slate-600">{status.message}</p>
      <ul className="mt-6 space-y-3">
        {status.missingCapabilities?.map((capability) => (
          <li key={capability} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">{capability}</li>
        ))}
      </ul>
      <p className="mt-5 text-sm text-slate-500">No school data was written and the existing offline database remains unchanged.</p>
      <button onClick={onLogout} className="mt-7 w-full rounded-xl border border-slate-300 px-5 py-3 font-semibold">Sign out</button>
    </div>
  );
}

function ProgressCard({ status }: { status: ProvisioningStatus }) {
  const steps = ['registration', 'downloading', 'initializing', 'verifying', 'finalizing', 'ready'];
  const current = Math.max(0, steps.indexOf(status.stage));
  return (
    <div>
      <p className="text-sm font-semibold text-cyan-700">SECURE PROVISIONING</p>
      <h2 className="mt-2 text-3xl font-semibold">Preparing offline mode</h2>
      <p className="mt-4 text-slate-600">{status.message ?? 'Working…'}</p>
      <div className="mt-7 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[#16a6a0] transition-all duration-500" style={{ width: `${status.progress ?? 0}%` }} />
      </div>
      <p className="mt-2 text-right text-sm font-semibold text-cyan-700">{status.progress ?? 0}%</p>
      <ol className="mt-7 space-y-3">
        {steps.slice(0, -1).map((step, index) => (
          <li key={step} className={`flex items-center gap-3 text-sm ${index <= current ? 'text-slate-900' : 'text-slate-400'}`}>
            <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${index < current ? 'bg-emerald-100 text-emerald-700' : index === current ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100'}`}>
              {index < current ? '✓' : index + 1}
            </span>
            {step.charAt(0).toUpperCase() + step.slice(1)}
          </li>
        ))}
      </ol>
      <p className="mt-7 text-xs text-slate-500">Keep NEMIS Desktop open. Interrupted imports roll back automatically and can be retried.</p>
    </div>
  );
}

function OfflineReady() {
  return (
    <div className="text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-8 w-8" /></div>
      <h2 className="mt-6 text-3xl font-semibold">Offline mode is ready</h2>
      <p className="mt-3 text-slate-600">Opening your school workspace…</p>
    </div>
  );
}

function LoadingScreen() {
  return <main className="grid min-h-screen place-items-center bg-[#071a33] text-white"><p className="animate-pulse">Restoring secure session…</p></main>;
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/5 p-4">{<span className="[&>svg]:h-5 [&>svg]:w-5 text-cyan-300">{icon}</span>}<p className="mt-3 font-semibold">{title}</p><p className="mt-1 text-xs text-slate-400">{text}</p></div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-5"><span className="text-slate-500">{label}</span><span className="text-right font-semibold">{value}</span></div>;
}
