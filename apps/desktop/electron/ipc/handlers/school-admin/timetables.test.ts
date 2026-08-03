import { describe,expect,it,vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import { DayOfWeek,SystemRole,type IpcChannel } from '@nemis-desktop/types';
import type { IpcHandle,IpcValidator } from '@app/ipc/registrar';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { registerTimetableHandlers } from './timetables';

const adminWorkspaces={active:{user:{id:'admin-1',role:SystemRole.INSTITUTION_ADMIN}}} as unknown as WorkspaceManager;

describe('timetable IPC handlers',()=>{
  it('validates strict create payloads and forwards only valid requests',async()=>{
    const calls=new Map<string,{validate:IpcValidator;handler:(...args:unknown[])=>unknown}>();
    const handle=((channel:IpcChannel,validate:IpcValidator,handler:unknown)=>calls.set(channel,{validate,handler:handler as (...args:unknown[])=>unknown})) as IpcHandle;
    const create=vi.fn(async()=>({data:{id:'entry-1'}}));
    registerTimetableHandlers(handle,{timetables:{create}} as unknown as ApplicationLayer,adminWorkspaces);
    const endpoint=calls.get('timetable:create')!;
    const request={institutionId:'inst-1',classId:'class-1',subjectId:'subject-1',staffId:'staff-1',dayOfWeek:DayOfWeek.MONDAY,startTime:'08:00',endTime:'08:45'};
    expect(()=>endpoint.validate([request])).not.toThrow();
    expect(()=>endpoint.validate([{...request,unexpected:true}])).toThrow();
    expect(()=>endpoint.validate([{...request,startTime:'8am'}])).toThrow();
    await endpoint.handler(request);expect(create).toHaveBeenCalledWith(request);
  });

  it('lets an admin fetch any teacher\'s schedule but blocks a teacher fetching someone else\'s',async()=>{
    const calls=new Map<string,{validate:IpcValidator;handler:(...args:unknown[])=>unknown}>();
    const handle=((channel:IpcChannel,validate:IpcValidator,handler:unknown)=>calls.set(channel,{validate,handler:handler as (...args:unknown[])=>unknown})) as IpcHandle;
    const getTeacherSchedule=vi.fn(async()=>({data:[]}));
    registerTimetableHandlers(handle,{timetables:{getTeacherSchedule}} as unknown as ApplicationLayer,adminWorkspaces);
    const endpoint=calls.get('timetable:teacher')!;
    await endpoint.handler('other-teacher');
    expect(getTeacherSchedule).toHaveBeenCalledWith('other-teacher');

    const teacherWorkspaces={active:{user:{id:'user-1',staffId:'staff-1',role:SystemRole.TEACHER}}} as unknown as WorkspaceManager;
    const calls2=new Map<string,{validate:IpcValidator;handler:(...args:unknown[])=>unknown}>();
    const handle2=((channel:IpcChannel,validate:IpcValidator,handler:unknown)=>calls2.set(channel,{validate,handler:handler as (...args:unknown[])=>unknown})) as IpcHandle;
    registerTimetableHandlers(handle2,{timetables:{getTeacherSchedule}} as unknown as ApplicationLayer,teacherWorkspaces);
    const endpoint2=calls2.get('timetable:teacher')!;
    await expect(endpoint2.handler('other-teacher')).rejects.toThrow('Teachers may only view their own timetable.');
    await expect(endpoint2.handler('staff-1')).resolves.toEqual([]);
  });
});
