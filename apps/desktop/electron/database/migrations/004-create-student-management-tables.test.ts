import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationService } from '../services/MigrationService';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { migrations } from './registry';

describe('004-create-student-management-tables', () => {
  let test: TestDatabase;
  beforeEach(() => { test = createTestDatabase(); new MigrationService(test.db.raw, migrations).migrateToLatest(); });
  afterEach(() => test.cleanup());
  it('creates guardian, link, and enrollment tables with search indexes', () => {
    const names=(test.db.raw.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index')").all() as {name:string}[]).map(r=>r.name);
    for(const name of ['guardians','student_guardians','enrollments','idx_students_name','idx_students_grade_active','idx_enrollments_student'])expect(names).toContain(name);
  });
  it('adds student contact and admission fields',()=>{const cols=(test.db.raw.prepare('PRAGMA table_info(students)').all() as {name:string}[]).map(c=>c.name);for(const name of ['admissionDate','phoneNumber','email','address'])expect(cols).toContain(name);});
});
