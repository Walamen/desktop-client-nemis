import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { MigrationService } from '../services/MigrationService';
import { createTestDatabase,type TestDatabase } from '../testing/createTestDatabase';
import { migrations } from './registry';
describe('005-create-teacher-management-tables',()=>{
  let test:TestDatabase;beforeEach(()=>{test=createTestDatabase();new MigrationService(test.db.raw,migrations).migrateToLatest();});afterEach(()=>test.cleanup());
  it('creates backend-aligned staff and assignment tables with indexes',()=>{const names=(test.db.raw.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index')").all() as {name:string}[]).map(v=>v.name);for(const name of ['staff','subject_teachers','class_teachers','class_subject_teachers','idx_staff_name','idx_class_subject_teachers_staff'])expect(names).toContain(name);});
});
