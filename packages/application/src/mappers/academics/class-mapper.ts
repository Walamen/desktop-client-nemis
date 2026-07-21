import type { Class } from '@nemis-desktop/domain';
import type { ClassOutput } from '../../dto/academics/academics-dto';

export function toClassOutput(entity: Class, subjectCount: number): ClassOutput {
  return {
    id: entity.id,
    academicYearId: entity.academicYearId,
    name: entity.name,
    section: entity.section,
    gradeLevel: entity.gradeLevel,
    capacity: entity.capacity,
    isActive: entity.isActive,
    subjectCount,
  };
}
