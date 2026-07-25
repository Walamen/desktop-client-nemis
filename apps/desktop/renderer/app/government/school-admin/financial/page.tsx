import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="Financial / fees" description="Institution fee rules, student obligations, and immutable payment history." sections={[
    { collection: 'fee_obligations', label: 'Obligations', columns: ['studentId', 'requiredAmount', 'totalPaid', 'status', 'dueDate'] },
    { collection: 'fee_payments', label: 'Payments', columns: ['receiptNumber', 'studentId', 'amount', 'method', 'paidAt', 'isReversed'] },
    { collection: 'fee_rules', label: 'Fee rules', columns: ['name', 'category', 'amount', 'currency', 'isMandatory', 'isActive'] },
  ]} />;
}
