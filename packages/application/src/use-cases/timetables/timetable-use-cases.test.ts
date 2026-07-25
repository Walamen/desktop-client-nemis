import { describe,expect,it } from 'vitest';
import { DayOfWeek } from '@nemis-desktop/types';
import { FixedClock,InMemoryTimetableRepository,RecordingLogger,SequentialIdGenerator } from '../../testing';
import { CopyTimetable,CreateTimetable,DeleteTimetable,UpdateTimetable,ValidateTimetable } from './timetable-use-cases';
const dto={institutionId:'inst-1',classId:'class-1',subjectId:'subject-1',staffId:'teacher-1',dayOfWeek:DayOfWeek.MONDAY,startTime:'08:00',endTime:'08:45'};
function build(){const timetables=new InMemoryTimetableRepository();timetables.assign('class-1','subject-1','teacher-1');return{timetables,deps:{timetables,clock:new FixedClock('2026-07-25T00:00:00.000Z'),ids:new SequentialIdGenerator('entry'),logger:new RecordingLogger()}};}
describe('timetable use cases',()=>{
  it('requires an existing class-subject-teacher assignment',async()=>{
    const {deps}=build();await expect(new CreateTimetable({...deps,timetables:new InMemoryTimetableRepository()}).execute(dto)).rejects.toThrow(/assign/i);
  });
  it('creates a valid assigned lesson and rejects teacher double booking',async()=>{
    const {deps,timetables}=build();const useCase=new CreateTimetable(deps);await useCase.execute(dto);
    timetables.assign('class-2','subject-1','teacher-1');
    await expect(useCase.execute({...dto,classId:'class-2',startTime:'08:15',endTime:'09:00'})).rejects.toThrow(/teacher/i);
  });
  it('returns user-facing conflicts without saving during validation',async()=>{
    const {deps}=build();const create=new CreateTimetable(deps);await create.execute(dto);
    const result=await new ValidateTimetable(deps).execute({entry:{...dto,startTime:'08:20',endTime:'08:40'}});
    expect(result.data[0]?.type).toBe('TIME_SLOT_CONFLICT');
  });
  it('updates, copies, and deletes schedules through repository interfaces',async()=>{
    const {deps,timetables}=build();const created=await new CreateTimetable(deps).execute(dto);
    const updated=await new UpdateTimetable(deps).execute({id:created.data.id,startTime:'09:00',endTime:'09:45'});
    expect(updated.data.startTime).toBe('09:00');
    timetables.assign('class-2','subject-1','teacher-2');
    const copied=await new CopyTimetable(deps).execute({sourceClassId:'class-1',targetClassId:'class-2'});
    expect(copied.data).toHaveLength(1);
    await new DeleteTimetable({timetables,logger:deps.logger}).execute(created.data.id);
    expect(timetables.findById(created.data.id)).toBeNull();
  });
});
