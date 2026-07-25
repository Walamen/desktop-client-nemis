import type { Teacher } from '@nemis-desktop/domain';
import type { ITeacherRepository, TeacherPageFilter } from '../../interfaces/teachers';
import type {
  AssignTeacherRequest, TeacherDashboardResult, TeachingAssignmentResult,
  UpdateTeachingAssignmentRequest,
} from '@nemis-desktop/types';

export class InMemoryTeacherRepository implements ITeacherRepository {
  readonly store = new Map<string, Teacher>();
  readonly assignments = new Map<string, TeachingAssignmentResult>();
  findById(id: string): Teacher | null { return this.store.get(id) ?? null; }
  save(teacher: Teacher): void { this.store.set(teacher.id, teacher); }
  existsByEmployeeNumber(institutionId: string, employeeNumber: string, excludeId?: string): boolean {
    return [...this.store.values()].some((v) => v.id !== excludeId && v.institutionId === institutionId && v.employeeNumber === employeeNumber);
  }
  existsByEmail(email: string, excludeId?: string): boolean {
    return [...this.store.values()].some((v) => v.id !== excludeId && v.data.email?.toLowerCase() === email.toLowerCase());
  }
  findPage(filter: TeacherPageFilter): { items: Teacher[]; total: number } {
    let rows=[...this.store.values()];
    if(filter.keyword){const q=filter.keyword.toLowerCase();rows=rows.filter(v=>v.fullName.toLowerCase().includes(q)||v.employeeNumber.toLowerCase().includes(q));}
    if(filter.isActive!==undefined)rows=rows.filter(v=>v.isActive===filter.isActive);
    if(filter.employmentType)rows=rows.filter(v=>v.data.employmentType===filter.employmentType);
    return {items:rows.slice(filter.offset,filter.offset+filter.limit),total:rows.length};
  }
  listAssignments(teacherId: string): TeachingAssignmentResult[] { return [...this.assignments.values()].filter(v=>v.teacherId===teacherId); }
  findAssignment(id: string): TeachingAssignmentResult | null { return this.assignments.get(id)??null; }
  findClassSubjectAssignment(classId:string,subjectId:string):TeachingAssignmentResult|null {
    return [...this.assignments.values()].find(v=>v.classId===classId&&v.subjectId===subjectId)??null;
  }
  assign(request: AssignTeacherRequest,id:string,assignedAt:string):TeachingAssignmentResult {
    if([...this.assignments.values()].some(v=>v.classId===request.classId&&v.subjectId===request.subjectId))throw new Error('Duplicate teaching assignment.');
    const row:TeachingAssignmentResult={id,teacherId:request.teacherId,institutionId:'inst-1',academicYearId:'year-1',academicYearName:'2026/2027',classId:request.classId,className:'Class',gradeLevel:'GRADE_1',subjectId:request.subjectId,isClassTeacher:request.isClassTeacher??false,assignedAt};
    this.assignments.set(id,row);return row;
  }
  updateAssignment(request:UpdateTeachingAssignmentRequest):TeachingAssignmentResult {
    const row=this.assignments.get(request.assignmentId);if(!row)throw new Error('Teaching assignment not found.');
    const next={...row,subjectId:request.subjectId??row.subjectId,isClassTeacher:request.isClassTeacher??row.isClassTeacher};this.assignments.set(row.id,next);return next;
  }
  removeAssignment(id:string):void{this.assignments.delete(id);}
  dashboard():TeacherDashboardResult{
    const active=[...this.store.values()].filter(v=>v.isActive);
    return {totalTeachers:active.length,bySubject:[],byGrade:[],byEmploymentStatus:[],recentlyAdded:active.slice(0,5).map(v=>({id:v.id,firstName:v.data.firstName,lastName:v.data.lastName,employeeNumber:v.employeeNumber,createdAt:v.data.createdAt})),totalAssignments:this.assignments.size,unassignedTeachers:active.filter(v=>this.listAssignments(v.id).length===0).length};
  }
}
