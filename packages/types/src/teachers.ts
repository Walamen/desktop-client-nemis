import type { ApprovalStatus, EmploymentType, Gender, GradeLevel, StaffPosition } from './enums';

export interface TeacherResult {
  id: string;
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  nationalId?: string;
  phoneNumber: string;
  email?: string;
  address?: string;
  employeeNumber: string;
  position: StaffPosition;
  employmentType: EmploymentType;
  dateOfJoining: string;
  dateOfLeaving?: string;
  qualifications?: Record<string, unknown>;
  isActive: boolean;
  photoUrl?: string;
  approvalStatus: ApprovalStatus;
  approvalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeachingAssignmentResult {
  id: string;
  teacherId: string;
  institutionId: string;
  academicYearId: string;
  academicYearName: string;
  classId: string;
  className: string;
  section?: string;
  gradeLevel: GradeLevel;
  subjectId?: string;
  subjectName?: string;
  isClassTeacher: boolean;
  assignedAt: string;
}

export interface TeacherProfileResult extends TeacherResult {
  assignments: TeachingAssignmentResult[];
}

export interface TeacherListRequest {
  limit?: number;
  offset?: number;
  keyword?: string;
  employmentType?: EmploymentType;
  position?: StaffPosition;
  isActive?: boolean;
  subjectId?: string;
  gradeLevel?: GradeLevel;
  classId?: string;
  academicYearId?: string;
  sort?: 'name' | 'employeeNumber' | 'dateOfJoining' | 'updatedAt';
}

export interface TeacherPageResult {
  items: TeacherResult[];
  total: number;
}

export interface CreateTeacherRequest {
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  nationalId?: string;
  phoneNumber: string;
  email?: string;
  address?: string;
  employeeNumber: string;
  position: StaffPosition;
  employmentType: EmploymentType;
  dateOfJoining: string;
  qualifications?: Record<string, unknown>;
  photoUrl?: string;
}

export interface UpdateTeacherRequest extends Partial<Omit<CreateTeacherRequest, 'institutionId'>> {
  teacherId: string;
}

export interface SetTeacherActiveRequest {
  teacherId: string;
  isActive: boolean;
}

export interface AssignTeacherRequest {
  teacherId: string;
  classId: string;
  subjectId: string;
  isClassTeacher?: boolean;
}

export interface UpdateTeachingAssignmentRequest {
  assignmentId: string;
  subjectId?: string;
  isClassTeacher?: boolean;
}

export interface RemoveTeachingAssignmentRequest {
  assignmentId: string;
}

export interface TeacherDashboardResult {
  totalTeachers: number;
  bySubject: { subjectId: string; subjectName: string; teacherCount: number }[];
  byGrade: { gradeLevel: GradeLevel; teacherCount: number }[];
  byEmploymentStatus: { employmentType: EmploymentType; teacherCount: number }[];
  recentlyAdded: Pick<TeacherResult, 'id' | 'firstName' | 'lastName' | 'employeeNumber' | 'createdAt'>[];
  totalAssignments: number;
  unassignedTeachers: number;
}
