import type { GradeLevel } from '@nemis-desktop/types';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { ITermRepository } from '../../interfaces/academics/term-repository';
import { WorkflowException } from '../../exceptions';

export interface EnrollmentTargetDeps {
  classes: IClassRepository;
  academicYears?: IAcademicYearRepository;
  terms?: ITermRepository;
}

/** The class/term/year checks every enrolment path must make - shared by
 * EnrollStudentUseCase and CreateAndEnrollStudentUseCase so they cannot drift.
 * `gradeLevel`, when given, must equal the class's grade: the End-of-Year
 * Outcomes cohort derives a child's grade from their class, so a mismatch
 * would file them under the wrong grade nationally. */
export function assertEnrollmentTarget(
  deps: EnrollmentTargetDeps,
  target: { classId: string; academicYearId: string; termId: string; gradeLevel?: GradeLevel },
): void {
  if (!deps.classes.exists(target.classId)) {
    throw new WorkflowException(`Class ${target.classId} does not exist.`);
  }
  const year = deps.academicYears?.findById(target.academicYearId);
  if (deps.academicYears && (!year || !year.isCurrent || year.status !== 'ACTIVE')) {
    throw new WorkflowException('Enrollment requires the current active academic year.');
  }
  const term = deps.terms?.findById(target.termId);
  if (deps.terms && (!term || !year || term.academicYearId !== year.id)) {
    throw new WorkflowException('The selected term does not belong to the academic year.');
  }
  const clazz = deps.classes.findById(target.classId);
  if (!clazz || !clazz.isActive || (year && clazz.academicYearId !== year.id)) {
    throw new WorkflowException('The selected class is not active in the academic year.');
  }
  if (target.gradeLevel && clazz.gradeLevel !== target.gradeLevel) {
    throw new WorkflowException('The selected class is for a different grade.');
  }
}
