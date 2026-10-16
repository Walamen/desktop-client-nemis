import type {
  CountyDistrictRow,
  CountyRef,
  ICountyAnalyticsReadModel,
} from '../../interfaces/county/county-analytics-read-model';

/** Settable canned aggregates; only listActiveStudentCreations filters. */
export class InMemoryCountyAnalyticsReadModel implements ICountyAnalyticsReadModel {
  county: CountyRef | null = null;
  districts: CountyDistrictRow[] = [];
  activeSchools = 0;
  activeStudents = 0;
  activeTeachers = 0;
  studentsByGender: { gender: string; count: number }[] = [];
  studentsByGradeLevel: { gradeLevel: string; count: number }[] = [];
  studentsByDistrict: { districtName: string; count: number }[] = [];
  studentCreations: { createdAt: string; gender: string }[] = [];
  schoolsForCoverage: { districtName: string | null; totalStudentCount: number }[] = [];

  getCounty(): CountyRef | null {
    return this.county;
  }
  listActiveDistricts(): CountyDistrictRow[] {
    return this.districts;
  }
  countActiveSchools(): number {
    return this.activeSchools;
  }
  countActiveStudents(): number {
    return this.activeStudents;
  }
  countActiveTeachers(): number {
    return this.activeTeachers;
  }
  countActiveStudentsByGender(): { gender: string; count: number }[] {
    return this.studentsByGender;
  }
  countActiveStudentsByGradeLevel(): { gradeLevel: string; count: number }[] {
    return this.studentsByGradeLevel;
  }
  countActiveStudentsByDistrict(): { districtName: string; count: number }[] {
    return this.studentsByDistrict;
  }
  listActiveStudentCreations(sinceIso: string): { createdAt: string; gender: string }[] {
    return this.studentCreations.filter((row) => row.createdAt >= sinceIso);
  }
  listActiveSchoolsForCoverage(): { districtName: string | null; totalStudentCount: number }[] {
    return this.schoolsForCoverage;
  }
}
