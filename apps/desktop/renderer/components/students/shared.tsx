import type { ReactNode } from 'react';
import { Gender, GradeLevel } from '@nemis-desktop/types';

export const grades = Object.values(GradeLevel);
export const genders = Object.values(Gender);

export const human = (v: string) => v.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const queryId = () =>
  typeof window === 'undefined'
    ? ''
    : (new URLSearchParams(window.location.search).get('id') ?? '');

export function Page({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="p-6 space-y-5">
      <div className="flex justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-slate-500">Offline student records stored on this device.</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
