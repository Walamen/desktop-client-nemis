import { describe,expect,it } from 'vitest';
import { ApprovalStatus,EmploymentType,Gender,StaffPosition } from '@nemis-desktop/types';
import { FixedClock,InMemoryTeacherRepository,RecordingLogger,SequentialIdGenerator } from '../../testing';
import { AssignTeacherUseCase,CreateTeacherUseCase } from './teacher-use-cases';
import type { IClassRepository,ISubjectRepository } from '../../interfaces';
const dto={institutionId:'inst-1',firstName:'Martha',lastName:'Doe',dateOfBirth:'1980-01-01',gender:Gender.FEMALE,phoneNumber:'0770000000',employeeNumber:'EMP-1',position:StaffPosition.TEACHER,employmentType:EmploymentType.FULL_TIME,dateOfJoining:'2020-01-01'};
describe('teacher use cases',()=>{
  it('creates an offline teacher and prevents duplicate identifiers',async()=>{const teachers=new InMemoryTeacherRepository();const useCase=new CreateTeacherUseCase({teachers,clock:new FixedClock('2026-01-01T00:00:00Z'),ids:new SequentialIdGenerator('teacher'),logger:new RecordingLogger()});const result=await useCase.execute(dto);expect(result.data.approvalStatus).toBe(ApprovalStatus.PENDING);await expect(useCase.execute(dto)).rejects.toThrow('Employee number already exists');});
  it('prevents assignments for archived teachers',async()=>{const teachers=new InMemoryTeacherRepository();const create=new CreateTeacherUseCase({teachers,clock:new FixedClock('2026-01-01T00:00:00Z'),ids:new SequentialIdGenerator('teacher'),logger:new RecordingLogger()});const teacher=(await create.execute(dto)).data;teachers.findById(teacher.id)!.archive('2026-02-01');const assign=new AssignTeacherUseCase({teachers,clock:new FixedClock('2026-02-01'),ids:new SequentialIdGenerator('assignment'),logger:new RecordingLogger(),classes:{} as IClassRepository,subjects:{} as ISubjectRepository});await expect(assign.execute({teacherId:teacher.id,classId:'class-1',subjectId:'subject-1'})).rejects.toThrow('Only active teachers');});
});
