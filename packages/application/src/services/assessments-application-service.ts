import type { ApplicationResponse } from '../core/response';
import type {
  AssessmentOutput,
  CreateAssessmentDto,
  GetGradesByStudentDto,
  GradeOutput,
  PublishGradeDto,
  RecordGradeDto,
} from '../dto/assessments/assessments-dto';
import type { CreateAssessmentUseCase } from '../use-cases/assessments/create-assessment';
import type { RecordGradeUseCase } from '../use-cases/assessments/record-grade';
import type { PublishGradeUseCase } from '../use-cases/assessments/publish-grade';
import type { GetGradesByStudentUseCase } from '../use-cases/assessments/get-grades-by-student';

export interface AssessmentsApplicationServiceDeps {
  createAssessment: CreateAssessmentUseCase;
  recordGrade: RecordGradeUseCase;
  publishGrade: PublishGradeUseCase;
  getGradesByStudent: GetGradesByStudentUseCase;
}

export class AssessmentsApplicationService {
  constructor(private readonly deps: AssessmentsApplicationServiceDeps) {}
  createAssessment(dto: CreateAssessmentDto): Promise<ApplicationResponse<AssessmentOutput>> {
    return this.deps.createAssessment.execute(dto);
  }
  recordGrade(dto: RecordGradeDto): Promise<ApplicationResponse<GradeOutput>> {
    return this.deps.recordGrade.execute(dto);
  }
  publishGrade(dto: PublishGradeDto): Promise<ApplicationResponse<GradeOutput>> {
    return this.deps.publishGrade.execute(dto);
  }
  getGradesByStudent(dto: GetGradesByStudentDto): Promise<ApplicationResponse<GradeOutput[]>> {
    return this.deps.getGradesByStudent.execute(dto);
  }
}
