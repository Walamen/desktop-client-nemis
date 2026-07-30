import { describe,expect,it,vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import { DayOfWeek,type IpcChannel } from '@nemis-desktop/types';
import type { IpcHandle,IpcValidator } from '@app/ipc/registrar';
import { registerTimetableHandlers } from './timetables';
describe('timetable IPC handlers',()=>{
  it('validates strict create payloads and forwards only valid requests',async()=>{
    const calls=new Map<string,{validate:IpcValidator;handler:(...args:unknown[])=>unknown}>();
    const handle=((channel:IpcChannel,validate:IpcValidator,handler:unknown)=>calls.set(channel,{validate,handler:handler as (...args:unknown[])=>unknown})) as IpcHandle;
    const create=vi.fn(async()=>({data:{id:'entry-1'}}));
    registerTimetableHandlers(handle,{timetables:{create}} as unknown as ApplicationLayer);
    const endpoint=calls.get('timetable:create')!;
    const request={institutionId:'inst-1',classId:'class-1',subjectId:'subject-1',staffId:'staff-1',dayOfWeek:DayOfWeek.MONDAY,startTime:'08:00',endTime:'08:45'};
    expect(()=>endpoint.validate([request])).not.toThrow();
    expect(()=>endpoint.validate([{...request,unexpected:true}])).toThrow();
    expect(()=>endpoint.validate([{...request,startTime:'8am'}])).toThrow();
    await endpoint.handler(request);expect(create).toHaveBeenCalledWith(request);
  });
});
