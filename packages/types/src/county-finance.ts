/**
 * County (CEO) Finance overview and Fee Rules pages, computed on this device
 * from the synced fee ledger (docs/superpowers/specs/2026-10-20-county-finance-design.md).
 * Every figure except fee rules covers each school's CURRENT academic year.
 */
export type CountyOwnership = 'GOVERNMENT' | 'PRIVATE' | 'NGO' | 'COMMUNITY' | 'MISSION';

export interface CountyFinanceDistrictRow {
  districtId: string;
  districtName: string;
  totalExpected: number;
  totalCollected: number;
  collectionRate: number;
  schoolCount: number;
}

export interface CountyFinanceDashboard {
  county: { id: string; name: string } | null;
  /** The current year's name when every school shares one; else null. */
  academicYearName: string | null;
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRate: number;
  schoolsReporting: number;
  totalSchools: number;
  studentsPaid: number;
  studentsPartial: number;
  studentsUnpaid: number;
  currency: string;
  districtComparison: CountyFinanceDistrictRow[];
}

export interface CountySchoolFinanceRow {
  institutionId: string;
  institutionName: string;
  institutionCode: string;
  districtId: string | null;
  districtName: string | null;
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRate: number;
  studentCount: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  currency: string;
}

export interface CountyFeeCollectionsQuery {
  search?: string;
  districtId?: string;
  ownership?: CountyOwnership;
  page: number;
  limit: number;
}

export interface CountyFeeCollectionRecord {
  id: string;
  studentName: string;
  nemisId: string | null;
  schoolName: string;
  schoolOwnership: string;
  districtName: string | null;
  feeRuleName: string;
  amountPaid: number;
  method: string;
  reference: string | null;
  paidAt: string;
}

export interface CountyFeeCollectionsResult {
  summary: { totalCollected: number; totalTransactions: number; schoolsWithPayments: number };
  records: CountyFeeCollectionRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface CountyFeeRulesQuery {
  search?: string;
  ownership?: CountyOwnership;
  page: number;
  limit: number;
}

export interface CountyFeeRuleItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  amount: number;
  currency: string;
  applicableLevels: string[];
  isMandatory: boolean;
  isActive: boolean;
}

export interface CountyFeeRulesSchool {
  id: string;
  name: string;
  ownership: string;
  district: { id: string; name: string } | null;
  ownFeeRules: CountyFeeRuleItem[];
}

export interface CountyFeeRulesResult {
  schools: CountyFeeRulesSchool[];
  total: number;
  page: number;
  limit: number;
}
