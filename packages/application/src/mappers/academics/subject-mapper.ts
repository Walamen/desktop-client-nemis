import type { Subject } from '@nemis-desktop/domain';
import type { SubjectOutput } from '../../dto/academics/academics-dto';
import type { ClassSubjectLink } from '../../interfaces/academics/subject-repository';
import type { ClassSubjectOutput } from '../../dto/academics/academics-dto';

export function toSubjectOutput(subject: Subject, classCount: number): SubjectOutput {
  return {
    id: subject.id,
    name: subject.name,
    code: subject.code,
    description: subject.description,
    isActive: subject.isActive,
    classCount,
  };
}

export function toClassSubjectOutput(link: ClassSubjectLink): ClassSubjectOutput {
  return {
    classId: link.classId,
    subjectId: link.subjectId,
    subjectName: link.subjectName,
    subjectCode: link.subjectCode,
    assignedAt: link.assignedAt,
  };
}
