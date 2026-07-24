import type { ApplicationResponse } from '../core/response';
import type { PagedResult } from '../core/pagination';
import type {
  ClassOutput,
  ClassRosterOutput,
  ClassSubjectOutput,
  ClassSubjectPairDto,
  CreateClassDto,
  CreateSubjectDto,
  CreateTermDto,
  DeletedOutput,
  DeleteTermDto,
  EnrollStudentDto,
  EnrollmentOutput,
  GetClassRosterDto,
  GradeLevelCountOutput,
  ListClassesDto,
  ListSubjectsDto,
  MoveEnrollmentClassDto,
  ListTermsDto,
  SetClassActiveDto,
  SetCurrentTermDto,
  SetSubjectActiveDto,
  SubjectOutput,
  TermOutput,
  UpdateClassDto,
  UpdateSubjectDto,
  UpdateTermDto,
  WithdrawEnrollmentDto,
} from '../dto/academics/academics-dto';
import type {
  AcademicYearListItemOutput,
  AcademicYearOutput,
  CreateAcademicYearDto,
  SetAcademicYearStatusDto,
  UpdateAcademicYearDto,
} from '../dto/academics/academic-year-dto';
import type { EnrollStudentUseCase } from '../use-cases/academics/enroll-student';
import type { WithdrawEnrollmentUseCase } from '../use-cases/academics/withdraw-enrollment';
import type { MoveEnrollmentClassUseCase } from '../use-cases/academics/move-enrollment-class';
import type { GetClassRosterUseCase } from '../use-cases/academics/get-class-roster';
import type { GetCurrentAcademicYearUseCase } from '../use-cases/academics/get-current-academic-year';
import type { ListAcademicYearsUseCase } from '../use-cases/academics/list-academic-years';
import type { CreateAcademicYearUseCase } from '../use-cases/academics/create-academic-year';
import type { UpdateAcademicYearUseCase } from '../use-cases/academics/update-academic-year';
import type {
  SetCurrentAcademicYearDto,
  SetCurrentAcademicYearUseCase,
} from '../use-cases/academics/set-current-academic-year';
import type { SetAcademicYearStatusUseCase } from '../use-cases/academics/set-academic-year-status';
import type { ListTermsUseCase } from '../use-cases/academics/list-terms';
import type { GetCurrentTermUseCase } from '../use-cases/academics/get-current-term';
import type { CreateTermUseCase } from '../use-cases/academics/create-term';
import type { UpdateTermUseCase } from '../use-cases/academics/update-term';
import type { SetCurrentTermUseCase } from '../use-cases/academics/set-current-term';
import type { DeleteTermUseCase } from '../use-cases/academics/delete-term';
import type { ListClassesUseCase } from '../use-cases/academics/list-classes';
import type { CreateClassUseCase } from '../use-cases/academics/create-class';
import type { UpdateClassUseCase } from '../use-cases/academics/update-class';
import type { SetClassActiveUseCase } from '../use-cases/academics/set-class-active';
import type { GetGradeLevelCountsUseCase } from '../use-cases/academics/get-grade-level-counts';
import type { ListSubjectsUseCase } from '../use-cases/academics/list-subjects';
import type { CreateSubjectUseCase } from '../use-cases/academics/create-subject';
import type { UpdateSubjectUseCase } from '../use-cases/academics/update-subject';
import type { SetSubjectActiveUseCase } from '../use-cases/academics/set-subject-active';
import type {
  ListClassSubjectsDto,
  ListClassSubjectsUseCase,
} from '../use-cases/academics/list-class-subjects';
import type { AssignSubjectToClassUseCase } from '../use-cases/academics/assign-subject-to-class';
import type { UnassignSubjectFromClassUseCase } from '../use-cases/academics/unassign-subject-from-class';

export interface AcademicsApplicationServiceDeps {
  enroll: EnrollStudentUseCase;
  withdraw: WithdrawEnrollmentUseCase;
  moveEnrollmentClass: MoveEnrollmentClassUseCase;
  getClassRoster: GetClassRosterUseCase;
  getCurrentAcademicYear: GetCurrentAcademicYearUseCase;
  listAcademicYears: ListAcademicYearsUseCase;
  createAcademicYear: CreateAcademicYearUseCase;
  updateAcademicYear: UpdateAcademicYearUseCase;
  setCurrentAcademicYear: SetCurrentAcademicYearUseCase;
  setAcademicYearStatus: SetAcademicYearStatusUseCase;
  listTerms: ListTermsUseCase;
  getCurrentTerm: GetCurrentTermUseCase;
  createTerm: CreateTermUseCase;
  updateTerm: UpdateTermUseCase;
  setCurrentTerm: SetCurrentTermUseCase;
  deleteTerm: DeleteTermUseCase;
  listClasses: ListClassesUseCase;
  createClass: CreateClassUseCase;
  updateClass: UpdateClassUseCase;
  setClassActive: SetClassActiveUseCase;
  getGradeLevelCounts: GetGradeLevelCountsUseCase;
  listSubjects: ListSubjectsUseCase;
  createSubject: CreateSubjectUseCase;
  updateSubject: UpdateSubjectUseCase;
  setSubjectActive: SetSubjectActiveUseCase;
  listClassSubjects: ListClassSubjectsUseCase;
  assignSubjectToClass: AssignSubjectToClassUseCase;
  unassignSubjectFromClass: UnassignSubjectFromClassUseCase;
}

export class AcademicsApplicationService {
  constructor(private readonly deps: AcademicsApplicationServiceDeps) {}

  enroll(dto: EnrollStudentDto): Promise<ApplicationResponse<EnrollmentOutput>> {
    return this.deps.enroll.execute(dto);
  }
  withdraw(dto: WithdrawEnrollmentDto): Promise<ApplicationResponse<EnrollmentOutput>> {
    return this.deps.withdraw.execute(dto);
  }
  moveEnrollmentClass(
    dto: MoveEnrollmentClassDto,
  ): Promise<ApplicationResponse<EnrollmentOutput>> {
    return this.deps.moveEnrollmentClass.execute(dto);
  }
  getClassRoster(dto: GetClassRosterDto): Promise<ApplicationResponse<ClassRosterOutput>> {
    return this.deps.getClassRoster.execute(dto);
  }
  getCurrentAcademicYear(): Promise<ApplicationResponse<AcademicYearOutput | null>> {
    return this.deps.getCurrentAcademicYear.execute({});
  }

  // --- Academic Years ---
  listAcademicYears(): Promise<ApplicationResponse<AcademicYearListItemOutput[]>> {
    return this.deps.listAcademicYears.execute({});
  }
  createAcademicYear(
    dto: CreateAcademicYearDto,
  ): Promise<ApplicationResponse<AcademicYearListItemOutput>> {
    return this.deps.createAcademicYear.execute(dto);
  }
  updateAcademicYear(
    dto: UpdateAcademicYearDto,
  ): Promise<ApplicationResponse<AcademicYearListItemOutput>> {
    return this.deps.updateAcademicYear.execute(dto);
  }
  setCurrentAcademicYear(
    dto: SetCurrentAcademicYearDto,
  ): Promise<ApplicationResponse<AcademicYearListItemOutput>> {
    return this.deps.setCurrentAcademicYear.execute(dto);
  }
  setAcademicYearStatus(
    dto: SetAcademicYearStatusDto,
  ): Promise<ApplicationResponse<AcademicYearListItemOutput>> {
    return this.deps.setAcademicYearStatus.execute(dto);
  }

  // --- Terms ---
  listTerms(dto: ListTermsDto): Promise<ApplicationResponse<TermOutput[]>> {
    return this.deps.listTerms.execute(dto);
  }
  getCurrentTerm(): Promise<ApplicationResponse<TermOutput | null>> {
    return this.deps.getCurrentTerm.execute({});
  }
  createTerm(dto: CreateTermDto): Promise<ApplicationResponse<TermOutput>> {
    return this.deps.createTerm.execute(dto);
  }
  updateTerm(dto: UpdateTermDto): Promise<ApplicationResponse<TermOutput>> {
    return this.deps.updateTerm.execute(dto);
  }
  setCurrentTerm(dto: SetCurrentTermDto): Promise<ApplicationResponse<TermOutput>> {
    return this.deps.setCurrentTerm.execute(dto);
  }
  deleteTerm(dto: DeleteTermDto): Promise<ApplicationResponse<DeletedOutput>> {
    return this.deps.deleteTerm.execute(dto);
  }

  // --- Classes ---
  listClasses(dto: ListClassesDto): Promise<ApplicationResponse<PagedResult<ClassOutput>>> {
    return this.deps.listClasses.execute(dto);
  }
  createClass(dto: CreateClassDto): Promise<ApplicationResponse<ClassOutput>> {
    return this.deps.createClass.execute(dto);
  }
  updateClass(dto: UpdateClassDto): Promise<ApplicationResponse<ClassOutput>> {
    return this.deps.updateClass.execute(dto);
  }
  setClassActive(dto: SetClassActiveDto): Promise<ApplicationResponse<ClassOutput>> {
    return this.deps.setClassActive.execute(dto);
  }
  getGradeLevelCounts(): Promise<ApplicationResponse<GradeLevelCountOutput[]>> {
    return this.deps.getGradeLevelCounts.execute({});
  }

  // --- Subjects ---
  listSubjects(dto: ListSubjectsDto): Promise<ApplicationResponse<PagedResult<SubjectOutput>>> {
    return this.deps.listSubjects.execute(dto);
  }
  createSubject(dto: CreateSubjectDto): Promise<ApplicationResponse<SubjectOutput>> {
    return this.deps.createSubject.execute(dto);
  }
  updateSubject(dto: UpdateSubjectDto): Promise<ApplicationResponse<SubjectOutput>> {
    return this.deps.updateSubject.execute(dto);
  }
  setSubjectActive(dto: SetSubjectActiveDto): Promise<ApplicationResponse<SubjectOutput>> {
    return this.deps.setSubjectActive.execute(dto);
  }

  // --- Class ↔ Subject assignment ---
  listClassSubjects(
    dto: ListClassSubjectsDto,
  ): Promise<ApplicationResponse<ClassSubjectOutput[]>> {
    return this.deps.listClassSubjects.execute(dto);
  }
  assignSubjectToClass(
    dto: ClassSubjectPairDto,
  ): Promise<ApplicationResponse<ClassSubjectOutput>> {
    return this.deps.assignSubjectToClass.execute(dto);
  }
  unassignSubjectFromClass(
    dto: ClassSubjectPairDto,
  ): Promise<ApplicationResponse<DeletedOutput>> {
    return this.deps.unassignSubjectFromClass.execute(dto);
  }
}
