import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { TimetableEntry } from '@nemis-desktop/domain';
import { DayOfWeek } from '@nemis-desktop/types';
import { createTestContext,type TestContext } from '../../../testing/createTestContext';
import { SqliteTeacherRepository } from './SqliteTeacherRepository';
import { SqliteTimetableRepository } from './SqliteTimetableRepository';
import { Teacher } from '@nemis-desktop/domain';
import { ApprovalStatus,EmploymentType,Gender,StaffPosition } from '@nemis-desktop/types';
const NOW='2026-07-25T08:00:00.000Z';
function entry(id:string,classId:string,start='08:00',end='08:45',staffId='teacher-1'){
  return TimetableEntry.create({id,institutionId:'inst-1',classId,subjectId:'subject-1',staffId,dayOfWeek:DayOfWeek.MONDAY,startTime:start,endTime:end,isBreak:false,createdAt:NOW,updatedAt:NOW});
}
describe('SqliteTimetableRepository',()=>{
  let test:TestContext,repo:SqliteTimetableRepository;
  beforeEach(()=>{
    test=createTestContext();const db=test.context.connection;repo=new SqliteTimetableRepository(test.context);
    db.prepare("INSERT INTO institutions (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt) VALUES ('inst-1','SCH','School','SCHOOL','GOVERNMENT','county-1','APPROVED',1,?)").run(NOW);
    db.prepare("INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,version,updatedAt,status) VALUES ('year-1','inst-1','2026/2027','2026-09-01','2027-06-30',1,1,?,'ACTIVE')").run(NOW);
    for(const id of ['class-1','class-2'])db.prepare("INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,isActive,version,updatedAt) VALUES (?,'inst-1','year-1',?,'GRADE_1',1,1,?)").run(id,id,NOW);
    db.prepare("INSERT INTO subjects (id,institutionId,name,code,isActive,version,updatedAt) VALUES ('subject-1','inst-1','Mathematics','MATH',1,1,?)").run(NOW);
    const teachers=new SqliteTeacherRepository(test.context);teachers.save(Teacher.create({id:'teacher-1',institutionId:'inst-1',firstName:'Martha',lastName:'Doe',dateOfBirth:'1980-01-01',gender:Gender.FEMALE,phoneNumber:'0770',employeeNumber:'EMP-1',position:StaffPosition.TEACHER,employmentType:EmploymentType.FULL_TIME,dateOfJoining:'2020-01-01',isActive:true,approvalStatus:ApprovalStatus.APPROVED,createdAt:NOW,updatedAt:NOW}));
    teachers.assign({teacherId:'teacher-1',classId:'class-1',subjectId:'subject-1'},'a1',NOW);
    teachers.save(Teacher.create({id:'teacher-2',institutionId:'inst-1',firstName:'James',lastName:'Cole',dateOfBirth:'1985-01-01',gender:Gender.MALE,phoneNumber:'0771',employeeNumber:'EMP-2',position:StaffPosition.TEACHER,employmentType:EmploymentType.FULL_TIME,dateOfJoining:'2021-01-01',isActive:true,approvalStatus:ApprovalStatus.APPROVED,createdAt:NOW,updatedAt:NOW}));
    teachers.assign({teacherId:'teacher-2',classId:'class-2',subjectId:'subject-1'},'a2',NOW);
  });
  afterEach(()=>test.cleanup());
  it('persists enriched schedule rows and supports indexed filters',()=>{
    repo.save(entry('e1','class-1'));
    const page=repo.findPage({limit:25,offset:0,classId:'class-1',teacherId:'teacher-1',subjectId:'subject-1',dayOfWeek:DayOfWeek.MONDAY});
    expect(page.total).toBe(1);expect(page.items[0]).toMatchObject({subjectName:'Mathematics',teacherName:'Martha Doe',academicYearName:'2026/2027'});
  });
  it('detects teacher and class overlaps but permits adjacent periods',()=>{
    repo.save(entry('e1','class-1'));
    expect(repo.detectConflicts(entry('e2','class-2','08:15','09:00'))[0]?.type).toBe('TEACHER_CONFLICT');
    expect(repo.detectConflicts(entry('e3','class-1','08:30','09:15'))[0]?.type).toBe('TIME_SLOT_CONFLICT');
    expect(repo.detectConflicts(entry('e4','class-2','08:45','09:30'))).toEqual([]);
  });
  it('derives bell periods and real dashboard metrics',()=>{
    repo.save(entry('e1','class-1'));repo.save(entry('e2','class-2','08:45','09:30'));
    expect(repo.periods()).toHaveLength(2);
    expect(repo.dashboard(DayOfWeek.MONDAY)).toMatchObject({totalEntries:2,classesScheduledToday:2,pendingConflicts:0});
  });
  it('copies atomically using the destination class subject teacher',()=>{
    repo.save(entry('e1','class-1'));
    const copied=repo.copy({sourceClassId:'class-1',targetClassId:'class-2'},['copy-1'],NOW);
    expect(copied).toHaveLength(1);expect(copied[0]).toMatchObject({classId:'class-2',staffId:'teacher-2'});
  });
});
