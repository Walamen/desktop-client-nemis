'use client';
import { useEffect } from 'react';
import { Avatar, Card } from '@nemis-desktop/ui';
import { X, Phone, Mail, MapPin, Briefcase, ShieldCheck } from 'lucide-react';
import { human, type GuardianRow } from './shared';

function ChildCard({ child }: { child: GuardianRow['children'][number] }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar firstName={child.firstName} lastName={child.lastName} role="student" size={40} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">
            {child.firstName} {child.lastName}
          </p>
          <p className="text-[11px] text-slate-400">
            {child.admissionNumber}
            {child.gradeLevel ? ` · ${human(child.gradeLevel)}` : ''}
          </p>
        </div>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
            child.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {child.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
    </Card>
  );
}

export function GuardianDrawer({ guardian, onClose }: { guardian: GuardianRow | null; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = guardian ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [guardian]);

  const isOpen = !!guardian;

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[400px] bg-slate-50 z-50 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {guardian && (
          <>
            <div className="bg-white px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-4">
                <Avatar firstName={guardian.firstName} lastName={guardian.lastName} role="parent" size={52} />
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-slate-900 truncate">
                    {guardian.firstName} {guardian.lastName}
                  </p>
                  <p className="text-[13px] font-medium text-sky-600">{guardian.relationship}</p>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <Card>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                  Contact Information
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4 text-slate-500" />
                    </div>
                    <span className="text-sm text-slate-700">{guardian.phoneNumber}</span>
                  </div>
                  {guardian.email && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 text-slate-500" />
                      </div>
                      <span className="text-sm text-slate-700 break-all">{guardian.email}</span>
                    </div>
                  )}
                  {guardian.address && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-slate-500" />
                      </div>
                      <span className="text-sm text-slate-700">{guardian.address}</span>
                    </div>
                  )}
                  {guardian.occupation && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                        <Briefcase className="w-4 h-4 text-slate-500" />
                      </div>
                      <span className="text-sm text-slate-700">{guardian.occupation}</span>
                    </div>
                  )}
                  {guardian.isEmergencyContact && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-4 h-4 text-amber-600" />
                      </div>
                      <span className="text-sm text-amber-700 font-medium">Emergency contact</span>
                    </div>
                  )}
                </div>
              </Card>

              <div>
                <p className="text-sm font-bold text-slate-800 mb-3">
                  Children at School ({guardian.children.length})
                </p>
                {guardian.children.length === 0 ? (
                  <p className="text-xs text-slate-400">No linked students on this device.</p>
                ) : (
                  <div className="space-y-3">
                    {guardian.children.map((child) => (
                      <ChildCard key={child.id} child={child} />
                    ))}
                  </div>
                )}
              </div>

              {guardian.updatedAt && (
                <div className="flex items-center justify-between py-3 border-t border-gray-100">
                  <span className="text-xs text-slate-400">Last Updated</span>
                  <span className="text-xs font-semibold text-slate-700">
                    {new Date(guardian.updatedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              )}
            </div>

            <div className="bg-white border-t border-gray-100 px-5 py-4 grid grid-cols-2 gap-3 shrink-0">
              <a
                href={`tel:${guardian.phoneNumber}`}
                className="flex items-center justify-center gap-2 bg-slate-900 text-white text-sm font-semibold py-3 rounded-xl hover:bg-slate-800 transition-colors"
              >
                <Phone className="w-4 h-4" />
                Call
              </a>
              {guardian.email ? (
                <a
                  href={`mailto:${guardian.email}`}
                  className="flex items-center justify-center gap-2 border border-slate-300 text-slate-700 text-sm font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  Email
                </a>
              ) : (
                <button
                  disabled
                  title="This guardian has no email on file"
                  className="flex items-center justify-center gap-2 border border-slate-200 text-slate-400 text-sm font-semibold py-3 rounded-xl cursor-not-allowed"
                >
                  <Mail className="w-4 h-4" />
                  Email
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
