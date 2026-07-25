import type {
  AssignTeacherDto,
  CreateTeacherDto,
  ListTeachersDto,
  RemoveTeachingAssignmentDto,
  SetTeacherActiveDto,
  TeacherDashboardOutput,
  TeacherOutput,
  TeacherPageOutput,
  TeacherProfileOutput,
  TeachingAssignmentOutput,
  UpdateTeacherDto,
  UpdateTeachingAssignmentDto,
} from '../dto/teachers/teacher-dto';
import type { ApplicationResponse } from '../core/response';
import type {
  AssignTeacherUseCase,
  CreateTeacherUseCase,
  GetTeacherDashboardUseCase,
  GetTeacherProfileUseCase,
  GetTeachingAssignmentsUseCase,
  RemoveAssignmentUseCase,
  SearchTeachersUseCase,
  SetTeacherActiveUseCase,
  UpdateAssignmentUseCase,
  UpdateTeacherUseCase,
} from '../use-cases/teachers/teacher-use-cases';

export interface TeacherApplicationServiceDeps {
  create: CreateTeacherUseCase; update: UpdateTeacherUseCase; setActive: SetTeacherActiveUseCase;
  search: SearchTeachersUseCase; getProfile: GetTeacherProfileUseCase;
  getAssignments: GetTeachingAssignmentsUseCase; assign: AssignTeacherUseCase;
  updateAssignment: UpdateAssignmentUseCase; removeAssignment: RemoveAssignmentUseCase;
  dashboard: GetTeacherDashboardUseCase;
}
export class TeacherApplicationService {
  constructor(private readonly deps: TeacherApplicationServiceDeps) {}
  create(dto: CreateTeacherDto): Promise<ApplicationResponse<TeacherOutput>> { return this.deps.create.execute(dto); }
  update(dto: UpdateTeacherDto): Promise<ApplicationResponse<TeacherOutput>> { return this.deps.update.execute(dto); }
  setActive(dto: SetTeacherActiveDto): Promise<ApplicationResponse<TeacherOutput>> { return this.deps.setActive.execute(dto); }
  list(dto: ListTeachersDto): Promise<ApplicationResponse<TeacherPageOutput>> { return this.deps.search.execute(dto); }
  getProfile(teacherId: string): Promise<ApplicationResponse<TeacherProfileOutput | null>> { return this.deps.getProfile.execute({ teacherId }); }
  getAssignments(teacherId: string): Promise<ApplicationResponse<TeachingAssignmentOutput[]>> { return this.deps.getAssignments.execute({ teacherId }); }
  assign(dto: AssignTeacherDto): Promise<ApplicationResponse<TeachingAssignmentOutput>> { return this.deps.assign.execute(dto); }
  updateAssignment(dto: UpdateTeachingAssignmentDto): Promise<ApplicationResponse<TeachingAssignmentOutput>> { return this.deps.updateAssignment.execute(dto); }
  removeAssignment(dto: RemoveTeachingAssignmentDto): Promise<ApplicationResponse<{ id: string }>> { return this.deps.removeAssignment.execute(dto); }
  dashboard(): Promise<ApplicationResponse<TeacherDashboardOutput>> { return this.deps.dashboard.execute(); }
}
