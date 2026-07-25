import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="Fee rules" description="National read-only rules and institution-owned fee rules available offline." sections={[
    { collection: 'fee_rules', label: 'Rules', columns: ['name', 'category', 'amount', 'currency', 'applicableLevels', 'isMandatory', 'isActive'] },
  ]} />;
}
