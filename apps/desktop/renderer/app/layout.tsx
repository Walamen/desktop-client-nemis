import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import { AppShell } from '@/layouts/AppShell';

export const metadata: Metadata = {
  title: 'NEMIS Desktop',
  description: 'Offline-first desktop client for the NEMIS platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
