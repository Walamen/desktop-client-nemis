import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County fee rules" description="Fee rules defined by institutions within this county." sections={[
    { collection: 'fee_rules', label: 'Fee rules', columns: ['name', 'category', 'amount', 'currency', 'isMandatory', 'isActive'] },
  ]} />;
}
