import { Teacher } from '@nemis-desktop/domain';
import { ApprovalStatus } from '@nemis-desktop/types';
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
} from '../../dto/teachers/teacher-dto';
import { WorkflowException } from '../../exceptions';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IAppLogger } from '../../interfaces/app-logger';
import type { ITeacherRepository } from '../../interfaces/teachers';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { ISubjectRepository } from '../../interfaces/academics/subject-repository';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { ok, type ApplicationResponse } from '../../core/response';
import { toTeacherOutput } from '../../mappers/teachers/teacher-mapper';

interface CommonDeps { teachers: ITeacherRepository; logger: IAppLogger }
interface MutatingDeps extends CommonDeps { clock: IClock }

export class CreateTeacherUseCase {
  constructor(private readonly deps: MutatingDeps & { ids: IIdGenerator }) {}
  execute(dto: CreateTeacherDto): Promise<ApplicationResponse<TeacherOutput>> {
    return invokeUseCase('CreateTeacher', this.deps.logger, async () => {
      if (this.deps.teachers.existsByEmployeeNumber(dto.institutionId, dto.employeeNumber)) throw new WorkflowException('Employee number already exists.');
      if (dto.email && this.deps.teachers.existsByEmail(dto.email)) throw new WorkflowException('Email already exists.');
      const now = this.deps.clock.now();
      const teacher = Teacher.create({
        ...dto,
        id: this.deps.ids.next(),
        isActive: true,
        approvalStatus: ApprovalStatus.PENDING,
        createdAt: now,
        updatedAt: now,
      });
      this.deps.teachers.save(teacher);
      return ok(toTeacherOutput(teacher));
    });
  }
}

export class UpdateTeacherUseCase {
  constructor(private readonly deps: MutatingDeps) {}
  execute(dto: UpdateTeacherDto): Promise<ApplicationResponse<TeacherOutput>> {
    return invokeUseCase('UpdateTeacher', this.deps.logger, async () => {
      const teacher = this.deps.teachers.findById(dto.teacherId);
      if (!teacher) throw new WorkflowException('Teacher not found.');
      if (dto.employeeNumber && this.deps.teachers.existsByEmployeeNumber(teacher.institutionId, dto.employeeNumber, teacher.id)) throw new WorkflowException('Employee number already exists.');
      if (dto.email && this.deps.teachers.existsByEmail(dto.email, teacher.id)) throw new WorkflowException('Email already exists.');
      const { teacherId: _teacherId, ...changes } = dto;
      teacher.update(changes, this.deps.clock.now());
      this.deps.teachers.save(teacher);
      return ok(toTeacherOutput(teacher));
    });
  }
}

export class ArchiveTeacherUseCase {
  constructor(private readonly deps: MutatingDeps) {}
  execute(dto: { teacherId: string }): Promise<ApplicationResponse<TeacherOutput>> {
    return invokeUseCase('ArchiveTeacher', this.deps.logger, async () => {
      const teacher = this.deps.teachers.findById(dto.teacherId);
      if (!teacher) throw new WorkflowException('Teacher not found.');
      teacher.archive(this.deps.clock.now());
      this.deps.teachers.save(teacher);
      return ok(toTeacherOutput(teacher));
    });
  }
}

export class RestoreTeacherUseCase {
  constructor(private readonly deps: MutatingDeps) {}
  execute(dto: { teacherId: string }): Promise<ApplicationResponse<TeacherOutput>> {
    return invokeUseCase('RestoreTeacher', this.deps.logger, async () => {
      const teacher = this.deps.teachers.findById(dto.teacherId);
      if (!teacher) throw new WorkflowException('Teacher not found.');
      teacher.restore(this.deps.clock.now());
      this.deps.teachers.save(teacher);
      return ok(toTeacherOutput(teacher));
    });
  }
}

export class SetTeacherActiveUseCase {
  constructor(private readonly archive: ArchiveTeacherUseCase, private readonly restore: RestoreTeacherUseCase) {}
  execute(dto: SetTeacherActiveDto): Promise<ApplicationResponse<TeacherOutput>> {
    return dto.isActive ? this.restore.execute(dto) : this.archive.execute(dto);
  }
}

export class SearchTeachersUseCase {
  constructor(private readonly deps: CommonDeps) {}
  execute(dto: ListTeachersDto): Promise<ApplicationResponse<TeacherPageOutput>> {
    return invokeUseCase('SearchTeachers', this.deps.logger, async () => {
      const page = this.deps.teachers.findPage({ ...dto, limit: dto.limit ?? 25, offset: dto.offset ?? 0 });
      return ok({ items: page.items.map(toTeacherOutput), total: page.total });
    });
  }
}

export class GetTeacherProfileUseCase {
  constructor(private readonly deps: CommonDeps) {}
  execute(dto: { teacherId: string }): Promise<ApplicationResponse<TeacherProfileOutput | null>> {
    return invokeUseCase('GetTeacherProfile', this.deps.logger, async () => {
      const teacher = this.deps.teachers.findById(dto.teacherId);
      return ok(teacher ? { ...toTeacherOutput(teacher), assignments: this.deps.teachers.listAssignments(teacher.id) } : null);
    });
  }
}

export class GetTeachingAssignmentsUseCase {
  constructor(private readonly deps: CommonDeps) {}
  execute(dto: { teacherId: string }): Promise<ApplicationResponse<TeachingAssignmentOutput[]>> {
    return invokeUseCase('GetTeachingAssignments', this.deps.logger, async () => ok(this.deps.teachers.listAssignments(dto.teacherId)));
  }
}

export class AssignTeacherUseCase {
  constructor(private readonly deps: MutatingDeps & { ids: IIdGenerator; classes: IClassRepository; subjects: ISubjectRepository }) {}
  execute(dto: AssignTeacherDto): Promise<ApplicationResponse<TeachingAssignmentOutput>> {
    return invokeUseCase('AssignTeacher', this.deps.logger, async () => {
      const teacher = this.deps.teachers.findById(dto.teacherId);
      if (!teacher) throw new WorkflowException('Teacher not found.');
      teacher.assertAssignable();
      const schoolClass=this.deps.classes.findById(dto.classId);
      if(!schoolClass||!schoolClass.isActive)throw new WorkflowException('Class not found or inactive.');
      if(schoolClass.institutionId!==teacher.institutionId)throw new WorkflowException('Teacher and class must belong to the same school.');
      const subject=this.deps.subjects.findById(dto.subjectId);
      if(!subject||!subject.isActive)throw new WorkflowException('Subject not found or inactive.');
      if(subject.institutionId!==teacher.institutionId)throw new WorkflowException('Teacher and subject must belong to the same school.');
      if(this.deps.teachers.findClassSubjectAssignment(dto.classId,dto.subjectId)) {
        throw new WorkflowException('This subject already has a teacher assigned in the selected class.');
      }
      return ok(this.deps.teachers.assign(dto, this.deps.ids.next(), this.deps.clock.now()));
    });
  }
}

export class UpdateAssignmentUseCase {
  constructor(private readonly deps: MutatingDeps & { subjects: ISubjectRepository }) {}
  execute(dto: UpdateTeachingAssignmentDto): Promise<ApplicationResponse<TeachingAssignmentOutput>> {
    return invokeUseCase('UpdateAssignment', this.deps.logger, async () => {
      const existing=this.deps.teachers.findAssignment(dto.assignmentId);
      if (!existing) throw new WorkflowException('Teaching assignment not found.');
      if(dto.subjectId){const subject=this.deps.subjects.findById(dto.subjectId);if(!subject||!subject.isActive||subject.institutionId!==existing.institutionId)throw new WorkflowException('Subject not found, inactive, or belongs to another school.');}
      return ok(this.deps.teachers.updateAssignment(dto, this.deps.clock.now()));
    });
  }
}

export class RemoveAssignmentUseCase {
  constructor(private readonly deps: CommonDeps) {}
  execute(dto: RemoveTeachingAssignmentDto): Promise<ApplicationResponse<{ id: string }>> {
    return invokeUseCase('RemoveAssignment', this.deps.logger, async () => {
      if (!this.deps.teachers.findAssignment(dto.assignmentId)) throw new WorkflowException('Teaching assignment not found.');
      this.deps.teachers.removeAssignment(dto.assignmentId);
      return ok({ id: dto.assignmentId });
    });
  }
}

export class GetTeacherDashboardUseCase {
  constructor(private readonly deps: CommonDeps) {}
  execute(): Promise<ApplicationResponse<TeacherDashboardOutput>> {
    return invokeUseCase('GetTeacherDashboard', this.deps.logger, async () => ok(this.deps.teachers.dashboard()));
  }
}
