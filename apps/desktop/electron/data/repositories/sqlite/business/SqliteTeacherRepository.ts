import { Teacher } from '@nemis-desktop/domain';
import type { ITeacherRepository, TeacherPageFilter } from '@nemis-desktop/application';
import type {
  ApprovalStatus,
  AssignTeacherRequest,
  EmploymentType,
  Gender,
  GradeLevel,
  StaffPosition,
  TeacherDashboardResult,
  TeachingAssignmentResult,
  UpdateTeachingAssignmentRequest,
} from '@nemis-desktop/types';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface StaffRow {
  id: string; institutionId: string; firstName: string; middleName: string | null; lastName: string;
  dateOfBirth: string; gender: string; nationalId: string | null; phoneNumber: string; email: string | null;
  address: string | null; employeeNumber: string; position: string; employmentType: string;
  dateOfJoining: string; dateOfLeaving: string | null; qualifications: string | null; isActive: number;
  photoUrl: string | null; approvalStatus: string; approvalNotes: string | null; createdAt: string; updatedAt: string;
}
interface AssignmentRow {
  id: string; teacherId: string; institutionId: string; academicYearId: string; academicYearName: string;
  classId: string; className: string; section: string | null; gradeLevel: string; subjectId: string | null;
  subjectName: string | null; isClassTeacher: number; assignedAt: string;
}
const COLUMNS = 'id, institutionId, firstName, middleName, lastName, dateOfBirth, gender, nationalId, phoneNumber, email, address, employeeNumber, position, employmentType, dateOfJoining, dateOfLeaving, qualifications, isActive, photoUrl, approvalStatus, approvalNotes, createdAt, updatedAt';
const assignmentSelect = `
  SELECT a.id, a.staffId teacherId, c.institutionId, c.academicYearId, y.code academicYearName,
         c.id classId, c.name className, c.section, c.gradeLevel, a.subjectId,
         s.name subjectName, 0 isClassTeacher, a.assignedAt
    FROM class_subject_teachers a JOIN classes c ON c.id=a.classId
    JOIN academic_years y ON y.id=c.academicYearId JOIN subjects s ON s.id=a.subjectId`;
const classAssignmentSelect = `
  SELECT a.id, a.staffId teacherId, c.institutionId, c.academicYearId, y.code academicYearName,
         c.id classId, c.name className, c.section, c.gradeLevel, NULL subjectId,
         NULL subjectName, a.isClassTeacher, a.assignedAt
    FROM class_teachers a JOIN classes c ON c.id=a.classId
    JOIN academic_years y ON y.id=c.academicYearId`;

function parseQualifications(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return undefined; }
}
function toTeacher(row: StaffRow): Teacher {
  return Teacher.reconstitute({
    id: row.id, institutionId: row.institutionId, firstName: row.firstName,
    middleName: row.middleName ?? undefined, lastName: row.lastName, dateOfBirth: row.dateOfBirth,
    gender: row.gender as Gender, nationalId: row.nationalId ?? undefined, phoneNumber: row.phoneNumber,
    email: row.email ?? undefined, address: row.address ?? undefined, employeeNumber: row.employeeNumber,
    position: row.position as StaffPosition, employmentType: row.employmentType as EmploymentType,
    dateOfJoining: row.dateOfJoining, dateOfLeaving: row.dateOfLeaving ?? undefined,
    qualifications: parseQualifications(row.qualifications), isActive: row.isActive === 1,
    photoUrl: row.photoUrl ?? undefined, approvalStatus: row.approvalStatus as ApprovalStatus,
    approvalNotes: row.approvalNotes ?? undefined, createdAt: row.createdAt, updatedAt: row.updatedAt,
  });
}
const toAssignment = (row: AssignmentRow): TeachingAssignmentResult => ({
  ...row, section: row.section ?? undefined, gradeLevel: row.gradeLevel as GradeLevel,
  subjectId: row.subjectId ?? undefined, subjectName: row.subjectName ?? undefined,
  isClassTeacher: row.isClassTeacher === 1,
});

export class SqliteTeacherRepository implements ITeacherRepository {
  readonly #statements: StatementCache;
  readonly #transactions: RepositoryContext['transactions'];
  constructor(context: RepositoryContext) { this.#statements = new StatementCache(context.connection); this.#transactions=context.transactions; }

  findById(id: string): Teacher | null {
    return guarded('SqliteTeacherRepository.findById', () => {
      const row = this.#statements.get(`SELECT ${COLUMNS} FROM staff WHERE id=? LIMIT 1`).get(id) as StaffRow | undefined;
      return row ? toTeacher(row) : null;
    });
  }
  findPage(filter: TeacherPageFilter): { items: Teacher[]; total: number } {
    return guarded('SqliteTeacherRepository.findPage', () => {
      const clauses: string[] = []; const params: unknown[] = [];
      if (filter.keyword) { const q=`%${filter.keyword}%`; clauses.push('(st.firstName LIKE ? OR st.lastName LIKE ? OR st.employeeNumber LIKE ?)'); params.push(q,q,q); }
      if (filter.employmentType) { clauses.push('st.employmentType=?'); params.push(filter.employmentType); }
      if (filter.position) { clauses.push('st.position=?'); params.push(filter.position); }
      if (filter.isActive !== undefined) { clauses.push('st.isActive=?'); params.push(filter.isActive ? 1 : 0); }
      if (filter.subjectId) { clauses.push('cst.subjectId=?'); params.push(filter.subjectId); }
      if (filter.classId) { if(filter.subjectId){clauses.push('cst.classId=?');params.push(filter.classId);}else{clauses.push('(cst.classId=? OR ct.classId=?)');params.push(filter.classId,filter.classId);} }
      if (filter.academicYearId) { if(filter.subjectId){clauses.push('c1.academicYearId=?');params.push(filter.academicYearId);}else{clauses.push('(c1.academicYearId=? OR c2.academicYearId=?)');params.push(filter.academicYearId,filter.academicYearId);} }
      if (filter.gradeLevel) { if(filter.subjectId){clauses.push('c1.gradeLevel=?');params.push(filter.gradeLevel);}else{clauses.push('(c1.gradeLevel=? OR c2.gradeLevel=?)');params.push(filter.gradeLevel,filter.gradeLevel);} }
      const joins = ` LEFT JOIN class_subject_teachers cst ON cst.staffId=st.id LEFT JOIN classes c1 ON c1.id=cst.classId LEFT JOIN class_teachers ct ON ct.staffId=st.id LEFT JOIN classes c2 ON c2.id=ct.classId`;
      const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
      const order = filter.sort === 'employeeNumber' ? 'st.employeeNumber' : filter.sort === 'dateOfJoining' ? 'st.dateOfJoining DESC' : filter.sort === 'name' ? 'st.lastName, st.firstName' : 'st.updatedAt DESC, st.id';
      const selected = COLUMNS.split(', ').map((c) => `st.${c}`).join(', ');
      const rows = this.#statements.get(`SELECT DISTINCT ${selected} FROM staff st${joins}${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params,filter.limit,filter.offset) as StaffRow[];
      const count = this.#statements.get(`SELECT COUNT(DISTINCT st.id) n FROM staff st${joins}${where}`).get(...params) as {n:number};
      return { items: rows.map(toTeacher), total: count.n };
    });
  }
  existsByEmployeeNumber(institutionId: string, employeeNumber: string, excludeId?: string): boolean {
    const sql=`SELECT id FROM staff WHERE institutionId=? AND employeeNumber=?${excludeId?' AND id<>?':''} LIMIT 1`;
    return (this.#statements.get(sql).get(...(excludeId?[institutionId,employeeNumber,excludeId]:[institutionId,employeeNumber])) !== undefined);
  }
  existsByEmail(email: string, excludeId?: string): boolean {
    const sql=`SELECT id FROM staff WHERE email=? COLLATE NOCASE${excludeId?' AND id<>?':''} LIMIT 1`;
    return this.#statements.get(sql).get(...(excludeId?[email,excludeId]:[email])) !== undefined;
  }
  save(teacher: Teacher): void {
    guarded('SqliteTeacherRepository.save', () => {
      const p=teacher.data;
      this.#statements.get(`INSERT INTO staff (${COLUMNS},version) VALUES (${COLUMNS.split(',').map(()=>'?').join(',')},1)
        ON CONFLICT(id) DO UPDATE SET institutionId=excluded.institutionId,firstName=excluded.firstName,middleName=excluded.middleName,lastName=excluded.lastName,dateOfBirth=excluded.dateOfBirth,gender=excluded.gender,nationalId=excluded.nationalId,phoneNumber=excluded.phoneNumber,email=excluded.email,address=excluded.address,employeeNumber=excluded.employeeNumber,position=excluded.position,employmentType=excluded.employmentType,dateOfJoining=excluded.dateOfJoining,dateOfLeaving=excluded.dateOfLeaving,qualifications=excluded.qualifications,isActive=excluded.isActive,photoUrl=excluded.photoUrl,approvalStatus=excluded.approvalStatus,approvalNotes=excluded.approvalNotes,updatedAt=excluded.updatedAt,version=version+1`)
        .run(p.id,p.institutionId,p.firstName,p.middleName??null,p.lastName,p.dateOfBirth,p.gender,p.nationalId??null,p.phoneNumber,p.email??null,p.address??null,p.employeeNumber,p.position,p.employmentType,p.dateOfJoining,p.dateOfLeaving??null,p.qualifications?JSON.stringify(p.qualifications):null,p.isActive?1:0,p.photoUrl??null,p.approvalStatus,p.approvalNotes??null,p.createdAt,p.updatedAt);
    });
  }
  listAssignments(teacherId: string): TeachingAssignmentResult[] {
    const rows = this.#statements.get(`${assignmentSelect} WHERE a.staffId=? UNION ALL ${classAssignmentSelect} WHERE a.staffId=? ORDER BY assignedAt DESC`).all(teacherId,teacherId) as AssignmentRow[];
    return rows.map(toAssignment);
  }
  findAssignment(id: string): TeachingAssignmentResult | null {
    const row = this.#statements.get(`${assignmentSelect} WHERE a.id=? UNION ALL ${classAssignmentSelect} WHERE a.id=? LIMIT 1`).get(id,id) as AssignmentRow|undefined;
    return row ? toAssignment(row) : null;
  }
  findClassSubjectAssignment(classId: string, subjectId: string): TeachingAssignmentResult | null {
    const row = this.#statements.get(`${assignmentSelect} WHERE a.classId=? AND a.subjectId=? LIMIT 1`).get(classId,subjectId) as AssignmentRow|undefined;
    return row ? toAssignment(row) : null;
  }
  assign(request: AssignTeacherRequest, id: string, now: string): TeachingAssignmentResult {
    return guarded('SqliteTeacherRepository.assign', () => this.#transactions.runImmediate(() => {
      const clazz=this.#statements.get('SELECT institutionId FROM classes WHERE id=? AND isActive=1').get(request.classId) as {institutionId:string}|undefined;
      if (!clazz) throw new Error('Class not found or inactive.');
      const subject=this.#statements.get('SELECT id FROM subjects WHERE id=? AND institutionId=? AND isActive=1').get(request.subjectId,clazz.institutionId);
      if (!subject) throw new Error('Subject not found or inactive.');
      if(request.isClassTeacher)this.#statements.get('UPDATE class_teachers SET isClassTeacher=0,updatedAt=?,version=version+1 WHERE classId=? AND isClassTeacher=1').run(now,request.classId);
      this.#statements.get('INSERT INTO class_teachers (id,classId,staffId,isClassTeacher,assignedAt,updatedAt) VALUES (?,?,?,?,?,?) ON CONFLICT(classId,staffId) DO UPDATE SET isClassTeacher=MAX(isClassTeacher,excluded.isClassTeacher),updatedAt=excluded.updatedAt,version=version+1').run(`${id}-class`,request.classId,request.teacherId,request.isClassTeacher?1:0,now,now);
      this.#statements.get('INSERT OR IGNORE INTO subject_teachers (id,subjectId,staffId,assignedAt,updatedAt) VALUES (?,?,?,?,?)').run(`${id}-subject`,request.subjectId,request.teacherId,now,now);
      this.#statements.get('INSERT OR IGNORE INTO class_subjects (id,classId,subjectId,assignedAt,version,updatedAt) VALUES (?,?,?,?,1,?)').run(`${id}-class-subject`,request.classId,request.subjectId,now,now);
      this.#statements.get('INSERT INTO class_subject_teachers (id,classId,subjectId,staffId,assignedAt,updatedAt) VALUES (?,?,?,?,?,?)').run(id,request.classId,request.subjectId,request.teacherId,now,now);
      const result=this.findAssignment(id);
      if (!result) throw new Error('Assignment could not be read after creation.');
      return result;
    }));
  }
  updateAssignment(request: UpdateTeachingAssignmentRequest, now: string): TeachingAssignmentResult {
    return guarded('SqliteTeacherRepository.updateAssignment', () => {
      const existing=this.findAssignment(request.assignmentId);
      if (!existing) throw new Error('Teaching assignment not found.');
      if (existing.subjectId) {
        if (request.subjectId) {
          this.#statements.get('INSERT OR IGNORE INTO subject_teachers (id,subjectId,staffId,assignedAt,updatedAt) VALUES (?,?,?,?,?)').run(`${request.assignmentId}-subject-update`,request.subjectId,existing.teacherId,now,now);
          this.#statements.get('INSERT OR IGNORE INTO class_subjects (id,classId,subjectId,assignedAt,version,updatedAt) VALUES (?,?,?,?,1,?)').run(`${request.assignmentId}-class-subject-update`,existing.classId,request.subjectId,now,now);
          this.#statements.get('UPDATE class_subject_teachers SET subjectId=?,updatedAt=?,version=version+1 WHERE id=?').run(request.subjectId,now,request.assignmentId);
        }
      } else if (request.isClassTeacher !== undefined) this.#statements.get('UPDATE class_teachers SET isClassTeacher=?,updatedAt=?,version=version+1 WHERE id=?').run(request.isClassTeacher?1:0,now,request.assignmentId);
      return this.findAssignment(request.assignmentId)!;
    });
  }
  removeAssignment(id: string): void {
    guarded('SqliteTeacherRepository.removeAssignment', () => this.#transactions.runImmediate(() => {
      const existing=this.findAssignment(id);
      if (!existing) return;
      this.#statements.get(existing.subjectId?'DELETE FROM class_subject_teachers WHERE id=?':'DELETE FROM class_teachers WHERE id=?').run(id);
    }));
  }
  dashboard(): TeacherDashboardResult {
    return guarded('SqliteTeacherRepository.dashboard', () => {
      const total=(this.#statements.get('SELECT COUNT(*) n FROM staff WHERE isActive=1').get() as {n:number}).n;
      const assigned=(this.#statements.get('SELECT COUNT(DISTINCT staffId) n FROM (SELECT staffId FROM class_subject_teachers UNION SELECT staffId FROM class_teachers)').get() as {n:number}).n;
      const recently=this.#statements.get('SELECT id,firstName,lastName,employeeNumber,createdAt FROM staff ORDER BY createdAt DESC LIMIT 5').all() as TeacherDashboardResult['recentlyAdded'];
      const bySubject=this.#statements.get('SELECT s.id subjectId,s.name subjectName,COUNT(DISTINCT a.staffId) teacherCount FROM class_subject_teachers a JOIN subjects s ON s.id=a.subjectId GROUP BY s.id,s.name ORDER BY teacherCount DESC').all() as TeacherDashboardResult['bySubject'];
      const byGrade=this.#statements.get('SELECT c.gradeLevel,COUNT(DISTINCT a.staffId) teacherCount FROM class_subject_teachers a JOIN classes c ON c.id=a.classId GROUP BY c.gradeLevel').all() as TeacherDashboardResult['byGrade'];
      const byEmploymentStatus=this.#statements.get('SELECT employmentType,COUNT(*) teacherCount FROM staff WHERE isActive=1 GROUP BY employmentType').all() as TeacherDashboardResult['byEmploymentStatus'];
      const totalAssignments=(this.#statements.get('SELECT (SELECT COUNT(*) FROM class_subject_teachers)+(SELECT COUNT(*) FROM class_teachers) n').get() as {n:number}).n;
      return { totalTeachers:total,bySubject,byGrade,byEmploymentStatus,recentlyAdded:recently,totalAssignments,unassignedTeachers:Math.max(0,total-assigned) };
    });
  }
}
