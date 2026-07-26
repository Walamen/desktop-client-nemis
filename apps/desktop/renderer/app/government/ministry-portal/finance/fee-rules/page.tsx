import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National fee rules" description="Fee rules defined across the authorized national dataset." sections={[
    { collection: 'fee_rules', label: 'Fee rules', columns: ['name', 'category', 'amount', 'currency', 'isMandatory', 'isActive'] },
  ]} />;
}
