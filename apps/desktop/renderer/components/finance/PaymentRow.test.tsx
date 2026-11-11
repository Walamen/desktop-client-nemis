import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SystemRole, type ProvisioningUser } from '@nemis-desktop/types';

const { listSchoolAdminRecords, saveSchoolAdminRecord } = vi.hoisted(() => ({
  listSchoolAdminRecords: vi.fn(async (): Promise<{ items: Record<string, unknown>[]; total: number }> => ({
    items: [],
    total: 0,
  })),
  saveSchoolAdminRecord: vi.fn(
    async (request: { collection: string; record: Record<string, unknown> }) => ({
      ...request.record,
      id: `${request.collection}-new`,
    }),
  ),
}));
vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: { listSchoolAdminRecords, saveSchoolAdminRecord },
}));

import { SessionUserProvider } from '@/components/shell/SessionUserContext';
import { PaymentRow, type EnrichedStudent } from './PaymentRow';

const NO_OBLIGATION_COPY =
  'This student has no fee obligation yet. Someone with Fee rules & payment plans access must set it up first.';

const user = (role: ProvisioningUser['role'], modules?: ProvisioningUser['modules']) =>
  ({ id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role, scope: 'INSTITUTION', modules }) as unknown as ProvisioningUser;

const student = (obligationId: string | null): EnrichedStudent => ({
  id: 'student-1',
  name: 'Musu Kollie',
  gradeLevel: 'GRADE_1',
  level: 'PRIMARY',
  rule: { id: 'rule-1', amount: 100 },
  obligationId,
  status: obligationId ? 'OUTSTANDING' : null,
  totalPaid: 0,
  balance: 100,
  requiredAmount: 100,
});

function renderRow(u: ProvisioningUser, s: EnrichedStudent) {
  const onSaved = vi.fn();
  render(
    <SessionUserProvider user={u}>
      <table>
        <tbody>
          <PaymentRow
            index={1}
            student={s}
            currency="USD"
            academicYearId="year-1"
            termId="term-1"
            canRecord
            onSaved={onSaved}
            onHistory={vi.fn()}
          />
        </tbody>
      </table>
    </SessionUserProvider>,
  );
  return { onSaved };
}

async function pay() {
  fireEvent.change(screen.getByLabelText('Payment amount for Musu Kollie'), { target: { value: '40' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

afterEach(() => {
  listSchoolAdminRecords.mockClear();
  saveSchoolAdminRecord.mockClear();
});

describe('PaymentRow for a student with no fee obligation', () => {
  it('a FINANCE_PAYMENTS-only user sees why and cannot save', () => {
    renderRow(user(SystemRole.INSTITUTION_STAFF, ['FINANCE_PAYMENTS']), student(null));
    expect(screen.getByText(NO_OBLIGATION_COPY)).toBeInTheDocument();
    expect(screen.queryByLabelText('Payment amount for Musu Kollie')).toBeNull();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(saveSchoolAdminRecord).not.toHaveBeenCalled();
  });

  it('a FINANCE_PAYMENTS-only user still pays a student who has an obligation', async () => {
    listSchoolAdminRecords.mockResolvedValueOnce({
      items: [{ id: 'obligation-1', studentId: 'student-1', feeRuleId: 'rule-1', termId: 'term-1' }],
      total: 1,
    });
    const { onSaved } = renderRow(user(SystemRole.INSTITUTION_STAFF, ['FINANCE_PAYMENTS']), student('obligation-1'));
    expect(screen.queryByText(NO_OBLIGATION_COPY)).toBeNull();
    await pay();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveSchoolAdminRecord.mock.calls.map(([request]) => request.collection)).toEqual(['fee_payments']);
  });

  it.each([
    ['an office user with both finance modules', user(SystemRole.INSTITUTION_STAFF, ['FINANCE_PAYMENTS', 'FINANCE_RULES'])],
    ['the School Admin', user(SystemRole.INSTITUTION_ADMIN)],
  ])('%s creates the obligation, then records the payment', async (_label, u) => {
    const { onSaved } = renderRow(u, student(null));
    expect(screen.queryByText(NO_OBLIGATION_COPY)).toBeNull();
    await pay();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveSchoolAdminRecord.mock.calls.map(([request]) => request.collection)).toEqual([
      'fee_obligations',
      'fee_payments',
    ]);
  });
});
