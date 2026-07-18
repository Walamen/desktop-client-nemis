import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { StudentApplicationService } from './student-application-service';
import { CreateStudentUseCase } from '../use-cases/students/create-student';
import { GetStudentByIdUseCase } from '../use-cases/students/get-student-by-id';
import { InMemoryStudentRepository } from '../testing/students/in-memory-student-repository';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../testing';

describe('StudentApplicationService', () => {
  it('delegates create then get through the service façade', async () => {
    const students = new InMemoryStudentRepository();
    const shared = {
      unitOfWork: new PassthroughUnitOfWork(),
      clock: new FixedClock('2026-07-18T00:00:00.000Z'),
      ids: new SequentialIdGenerator('stu'),
      events: new CollectingEventPublisher(),
      logger: new RecordingLogger(),
    };
    const service = new StudentApplicationService({
      create: new CreateStudentUseCase({ students, ...shared }),
      getById: new GetStudentByIdUseCase({ students, logger: shared.logger }),
    });
    const created = await service.create({
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
    });
    const fetched = await service.getById({ studentId: created.data.id });
    expect(fetched.data?.id).toBe(created.data.id);
  });
});
