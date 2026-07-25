import { describe,expect,it } from 'vitest';
import { ApprovalStatus,EmploymentType,Gender,StaffPosition } from '@nemis-desktop/types';
import { Teacher } from './teacher';
const make=()=>Teacher.create({id:'t1',institutionId:'i1',firstName:'Martha',lastName:'Doe',dateOfBirth:'1980-01-01',gender:Gender.FEMALE,phoneNumber:'0770000000',employeeNumber:'EMP-1',position:StaffPosition.TEACHER,employmentType:EmploymentType.FULL_TIME,dateOfJoining:'2020-01-01',isActive:true,approvalStatus:ApprovalStatus.PENDING,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'});
describe('Teacher',()=>{
  it('archives and restores through valid state transitions',()=>{const t=make();t.archive('2026-02-01T00:00:00Z');expect(t.isActive).toBe(false);expect(()=>t.assertAssignable()).toThrow('Only active');t.restore('2026-02-02T00:00:00Z');expect(t.isActive).toBe(true);});
  it('validates required employee identity',()=>{expect(()=>Teacher.create({...make().data,employeeNumber:' '})).toThrow('Teacher details are invalid');});
});
