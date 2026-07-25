'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SchoolAdminCollection, SchoolAdminRecord } from '@nemis-desktop/types';
import { nemisBridge } from '@/services/nemis-bridge';

type Section = {
  collection: SchoolAdminCollection;
  label: string;
  columns: readonly string[];
};

function human(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function display(value: SchoolAdminRecord[string] | undefined): string {
  if (value === null || value === '') return '—';
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString();
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return new Date(text).toLocaleString();
  return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}

export function SchoolAdminCollectionPage({
  title,
  description,
  sections,
}: {
  title: string;
  description: string;
  sections: readonly Section[];
}) {
  const [active, setActive] = useState(sections[0]!.collection);
  const section = sections.find((item) => item.collection === active) ?? sections[0]!;
  const [items, setItems] = useState<SchoolAdminRecord[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await nemisBridge.listSchoolAdminRecords({ collection: active, limit: 200 });
      setItems(result.items);
      setTotal(result.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load offline records.');
      setItems([]);
    }
  }, [active]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  const markRead = async (record: SchoolAdminRecord) => {
    await nemisBridge.saveSchoolAdminRecord({
      collection: 'user_notifications',
      record: { id: record.id!, isRead: true },
    });
    await load();
  };
  const updateWorkflow = async (record: SchoolAdminRecord, changes: SchoolAdminRecord) => {
    await nemisBridge.saveSchoolAdminRecord({
      collection: active,
      record: { id: record.id!, ...changes },
    });
    await load();
  };
  const hasActions =
    active === 'user_notifications' || active === 'alerts' || active === 'student_transfers';

  return (
    <main className="p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          {total} offline record{total === 1 ? '' : 's'}
        </span>
      </div>
      {sections.length > 1 && (
        <div className="mt-5 flex flex-wrap gap-2" role="tablist">
          {sections.map((item) => (
            <button
              key={item.collection}
              type="button"
              onClick={() => setActive(item.collection)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                active === item.collection
                  ? 'bg-blue-700 text-white'
                  : 'border bg-white text-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-5 overflow-hidden rounded-xl border bg-white">
        {items === null ? (
          <p className="p-6 text-sm text-slate-500">Loading encrypted offline data…</p>
        ) : error ? (
          <div className="p-6 text-sm text-red-700">
            <p>{error}</p>
            <button type="button" className="mt-3 underline" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            No {section.label.toLowerCase()} have been downloaded or created in this workspace.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {section.columns.map((column) => (
                    <th key={column} className="px-4 py-3">
                      {human(column)}
                    </th>
                  ))}
                  {hasActions && <th className="px-4 py-3">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((record) => (
                  <tr key={String(record.id)} className="align-top">
                    {section.columns.map((column) => (
                      <td key={column} className="max-w-xs px-4 py-3 text-slate-700">
                        {display(record[column])}
                      </td>
                    ))}
                    {hasActions && (
                      <td className="px-4 py-3">
                        {active === 'user_notifications' && !record.isRead && (
                          <button
                            className="text-blue-700 underline"
                            type="button"
                            onClick={() => void markRead(record)}
                          >
                            Mark read
                          </button>
                        )}
                        {active === 'alerts' && !record.isResolved && (
                          <button
                            className="text-blue-700 underline"
                            type="button"
                            onClick={() =>
                              void updateWorkflow(record, {
                                isResolved: true,
                                resolvedAt: new Date().toISOString(),
                              })
                            }
                          >
                            Resolve
                          </button>
                        )}
                        {active === 'student_transfers' && record.status === 'PENDING' && (
                          <button
                            className="text-blue-700 underline"
                            type="button"
                            onClick={() =>
                              void updateWorkflow(record, {
                                status: 'APPROVED',
                                reviewedAt: new Date().toISOString(),
                              })
                            }
                          >
                            Approve
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

export function RecordPaymentPage() {
  const [obligations, setObligations] = useState<SchoolAdminRecord[]>([]);
  const [students, setStudents] = useState<SchoolAdminRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const openObligations = useMemo(
    () => obligations.filter((item) => item.status !== 'PAID_IN_FULL' && item.status !== 'WAIVED'),
    [obligations],
  );
  useEffect(() => {
    void nemisBridge
      .listSchoolAdminRecords({ collection: 'fee_obligations', limit: 250 })
      .then((result) => setObligations(result.items));
    void nemisBridge
      .listStudents({ limit: 250, offset: 0 })
      .then((result) => setStudents(result.items as unknown as SchoolAdminRecord[]));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const obligation = obligations.find((item) => item.id === form.get('obligationId'));
    if (!obligation) return setMessage('Choose a valid outstanding obligation.');
    try {
      await nemisBridge.saveSchoolAdminRecord({
        collection: 'fee_payments',
        record: {
          obligationId: String(obligation.id),
          studentId: String(obligation.studentId),
          amount: Number(form.get('amount')),
          method: String(form.get('method')),
          reference: String(form.get('reference') ?? '') || null,
          notes: String(form.get('notes') ?? '') || null,
          receiptNumber: `OFF-${Date.now()}`,
          recordedBy: '',
          isReversed: false,
          paidAt: new Date().toISOString(),
        },
      });
      event.currentTarget.reset();
      setMessage('Payment saved offline. It will synchronize when connectivity returns.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Payment could not be saved.');
    }
  };

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Record payment</h1>
      <p className="mt-1 text-sm text-slate-600">
        Payments are append-only and receive an offline receipt before synchronization.
      </p>
      <form
        onSubmit={(event) => void submit(event)}
        className="mt-6 max-w-2xl space-y-4 rounded-xl border bg-white p-6"
      >
        <label className="block text-sm font-medium">
          Outstanding obligation
          <select name="obligationId" required className="mt-1 w-full rounded-lg border px-3 py-2">
            <option value="">Select an obligation</option>
            {openObligations.map((item) => {
              const student = students.find((entry) => entry.id === item.studentId);
              return (
                <option key={String(item.id)} value={String(item.id)}>
                  {student ? `${student.firstName} ${student.lastName}` : item.studentId} —{' '}
                  {item.requiredAmount} ({item.status})
                </option>
              );
            })}
          </select>
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">
            Amount
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium">
            Method
            <select name="method" required className="mt-1 w-full rounded-lg border px-3 py-2">
              {['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CHECK', 'OTHER'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium">
          Reference
          <input name="reference" className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="block text-sm font-medium">
          Notes
          <textarea name="notes" className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">
          Save offline payment
        </button>
        {message && <p className="text-sm text-slate-700">{message}</p>}
      </form>
    </main>
  );
}
