import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { Teacher } from '@nemis-desktop/domain';
import { ApprovalStatus,EmploymentType,Gender,StaffPosition } from '@nemis-desktop/types';
import { createTestContext,type TestContext } from '../../../testing/createTestContext';
import { SqliteTeacherRepository } from './SqliteTeacherRepository';
const NOW='2026-07-24T00:00:00.000Z';
function teacher(id='teacher-1',employeeNumber='EMP-1'){return Teacher.create({id,institutionId:'inst-1',firstName:'Martha',lastName:'Doe',dateOfBirth:'1980-01-01',gender:Gender.FEMALE,phoneNumber:'0770000000',employeeNumber,position:StaffPosition.TEACHER,employmentType:EmploymentType.FULL_TIME,dateOfJoining:'2020-01-01',isActive:true,approvalStatus:ApprovalStatus.PENDING,createdAt:NOW,updatedAt:NOW});}
describe('SqliteTeacherRepository',()=>{
  let test:TestContext,repo:SqliteTeacherRepository;
  beforeEach(()=>{test=createTestContext();repo=new SqliteTeacherRepository(test.context);const db=test.context.connection;db.prepare("INSERT INTO institutions (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt) VALUES ('inst-1','SCH','School','SCHOOL','GOVERNMENT','county-1','APPROVED',1,?)").run(NOW);db.prepare("INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,version,updatedAt,status) VALUES ('year-1','inst-1','2026/2027','2026-09-01','2027-06-30',1,1,?,'ACTIVE')").run(NOW);db.prepare("INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,isActive,version,updatedAt,section) VALUES ('class-1','inst-1','year-1','Grade 1 A','GRADE_1',1,1,?,'A')").run(NOW);db.prepare("INSERT INTO subjects (id,institutionId,name,code,isActive,version,updatedAt) VALUES ('subject-1','inst-1','Mathematics','MATH',1,1,?)").run(NOW);});afterEach(()=>test.cleanup());
  it('persists and pages teachers with unique employee lookup',()=>{repo.save(teacher());expect(repo.findById('teacher-1')?.fullName).toBe('Martha Doe');expect(repo.existsByEmployeeNumber('inst-1','EMP-1')).toBe(true);expect(repo.findPage({limit:25,offset:0,keyword:'Martha'}).total).toBe(1);});
  it('creates the backend-aligned class, subject, and class-subject relations atomically',()=>{repo.save(teacher());const assignment=repo.assign({teacherId:'teacher-1',classId:'class-1',subjectId:'subject-1',isClassTeacher:true},'assignment-1',NOW);expect(assignment.subjectName).toBe('Mathematics');expect(repo.listAssignments('teacher-1')).toHaveLength(2);const counts=test.context.connection.prepare("SELECT (SELECT COUNT(*) FROM class_teachers) classCount,(SELECT COUNT(*) FROM subject_teachers) subjectCount,(SELECT COUNT(*) FROM class_subject_teachers) teachingCount").get() as {classCount:number;subjectCount:number;teachingCount:number};expect(counts).toEqual({classCount:1,subjectCount:1,teachingCount:1});});
  it('rejects a second teacher for the same class subject',()=>{repo.save(teacher());repo.save(teacher('teacher-2','EMP-2'));repo.assign({teacherId:'teacher-1',classId:'class-1',subjectId:'subject-1'},'assignment-1',NOW);expect(()=>repo.assign({teacherId:'teacher-2',classId:'class-1',subjectId:'subject-1'},'assignment-2',NOW)).toThrow();});
  it('listAssignments returns every year by default and only the active year with activeYearOnly; dashboard counts active year only',()=>{
    const db=test.context.connection;
    db.prepare("INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,version,updatedAt,status) VALUES ('year-0','inst-1','2025/2026','2025-09-01','2026-06-30',0,1,?,'SETUP')").run(NOW);
    db.prepare("INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,isActive,version,updatedAt,section) VALUES ('class-0','inst-1','year-0','Grade 5 A','GRADE_5',1,1,?,'A')").run(NOW);
    repo.save(teacher());repo.save(teacher('teacher-2','EMP-2'));
    repo.assign({teacherId:'teacher-1',classId:'class-1',subjectId:'subject-1',isClassTeacher:true},'assignment-1',NOW);
    db.prepare("INSERT INTO subjects (id,institutionId,name,code,isActive,version,updatedAt) VALUES ('subject-2','inst-1','Science','SCI',1,1,?)").run(NOW);repo.assign({teacherId:'teacher-1',classId:'class-0',subjectId:'subject-2',isClassTeacher:true},'assignment-0',NOW);
    repo.assign({teacherId:'teacher-2',classId:'class-0',subjectId:'subject-1'},'assignment-00',NOW);
    expect(repo.listAssignments('teacher-1')).toHaveLength(4);
    expect(repo.listAssignments('teacher-1',{activeYearOnly:false})).toHaveLength(4);
    expect(repo.listAssignments('teacher-1',{activeYearOnly:true}).every((a)=>a.classId==='class-1')).toBe(true);
    expect(repo.listAssignments('teacher-1',{activeYearOnly:true})).toHaveLength(2);
    expect(repo.listAssignments('teacher-2')).toHaveLength(2);
    expect(repo.listAssignments('teacher-2',{activeYearOnly:true})).toHaveLength(0);
    const d=repo.dashboard();
    expect(d.totalAssignments).toBe(2);
    expect(d.unassignedTeachers).toBe(1);
    expect(d.bySubject).toEqual([{subjectId:'subject-1',subjectName:'Mathematics',teacherCount:1}]);
    expect(d.byGrade).toEqual([{gradeLevel:'GRADE_1',teacherCount:1}]);
  });
});
