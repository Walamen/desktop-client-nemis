import type {
  ApplicationResponse,
  StudentApplicationService,
  StudentOutput,
} from '@nemis-desktop/application';

export class GetStudentByIdUiQuery {
  constructor(private readonly students: StudentApplicationService) {}

  execute(studentId: string): Promise<ApplicationResponse<StudentOutput | null>> {
    return this.students.getById({ studentId });
  }
}
