import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { MigrationService } from '../services/MigrationService';
import { createTestDatabase,type TestDatabase } from '../testing/createTestDatabase';
import { migrations } from './registry';

describe('007-create-timetable-management-tables',()=>{
  let test:TestDatabase;
  beforeEach(()=>{test=createTestDatabase();new MigrationService(test.db.raw,migrations).migrateToLatest();});
  afterEach(()=>test.cleanup());
  it('creates the backend-aligned timetable table and query indexes',()=>{
    const names=(test.db.raw.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index')").all() as {name:string}[]).map(v=>v.name);
    expect(names).toContain('timetable_entries');
    expect(names).toContain('idx_timetable_class_day_time');
    expect(names).toContain('idx_timetable_staff_day_time');
    expect(names).toContain('idx_timetable_subject_day');
  });
  it('rejects invalid weekday and reversed time ranges',()=>{
    expect(()=>test.db.raw.prepare(`INSERT INTO timetable_entries
      (id,institutionId,classId,dayOfWeek,startTime,endTime,isBreak,createdAt,updatedAt)
      VALUES ('x','missing','missing','HOLIDAY','09:00','08:00',1,'now','now')`).run()).toThrow();
  });
});

