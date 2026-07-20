import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Crete_Round, Lato, Poppins } from 'next/font/google';
import '@/styles/globals.css';
import { RootProviders } from './providers';

const creteRound = Crete_Round({ subsets: ['latin'], weight: ['400'], variable: '--font-crete-round', display: 'swap' });
const lato = Lato({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-lato', display: 'swap' });
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-poppins', display: 'swap' });

export const metadata: Metadata = {
  title: 'NEMIS Desktop',
  description: 'Offline-first desktop client for the NEMIS platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${creteRound.variable} ${lato.variable} ${poppins.variable} font-sans antialiased bg-neutral-light text-slate-900`}>
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
