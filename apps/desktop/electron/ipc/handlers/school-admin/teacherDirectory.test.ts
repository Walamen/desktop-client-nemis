import { describe,expect,it,vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import { SystemRole, type IpcChannel } from '@nemis-desktop/types';
import type { IpcHandle,IpcValidator } from '@app/ipc/registrar';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { registerTeacherDirectoryHandlers } from './teacherDirectory';
const workspaces={active:{user:{id:'admin-1',role:SystemRole.INSTITUTION_ADMIN}}} as unknown as WorkspaceManager;
describe('teacher directory IPC handlers',()=>{
  it('validates and forwards assignment requests',async()=>{const calls=new Map<string,{validate:IpcValidator;handler:(...a:unknown[])=>unknown}>();const handle=((channel:IpcChannel,validate:IpcValidator,handler:unknown)=>calls.set(channel,{validate,handler:handler as (...a:unknown[])=>unknown})) as IpcHandle;const assign=vi.fn(async()=>({data:{id:'a1'}}));registerTeacherDirectoryHandlers(handle,{teachers:{assign}} as unknown as ApplicationLayer,workspaces);const endpoint=calls.get('teacher:assign')!;expect(()=>endpoint.validate([{teacherId:'t1',classId:'c1',subjectId:'s1'}])).not.toThrow();expect(()=>endpoint.validate([{teacherId:'t1'}])).toThrow();await endpoint.handler({teacherId:'t1',classId:'c1',subjectId:'s1'});expect(assign).toHaveBeenCalled();});

  it('lets an admin fetch any teacher\'s assignments but blocks a teacher fetching someone else\'s',async()=>{const calls=new Map<string,{validate:IpcValidator;handler:(...a:unknown[])=>unknown}>();const handle=((channel:IpcChannel,validate:IpcValidator,handler:unknown)=>calls.set(channel,{validate,handler:handler as (...a:unknown[])=>unknown})) as IpcHandle;const getAssignments=vi.fn(async()=>({data:[]}));registerTeacherDirectoryHandlers(handle,{teachers:{getAssignments}} as unknown as ApplicationLayer,workspaces);const endpoint=calls.get('teacher:list-assignments')!;await endpoint.handler('other-teacher');expect(getAssignments).toHaveBeenCalledWith('other-teacher');
    // A TEACHER's login id (users.id) and their staff record id (staff.id,
    // linked via staff.userId) are different values — the handler must scope
    // against staffId, not the login id.
    const teacherWorkspaces={active:{user:{id:'user-1',staffId:'staff-1',role:SystemRole.TEACHER}}} as unknown as WorkspaceManager;const calls2=new Map<string,{validate:IpcValidator;handler:(...a:unknown[])=>unknown}>();const handle2=((channel:IpcChannel,validate:IpcValidator,handler:unknown)=>calls2.set(channel,{validate,handler:handler as (...a:unknown[])=>unknown})) as IpcHandle;registerTeacherDirectoryHandlers(handle2,{teachers:{getAssignments}} as unknown as ApplicationLayer,teacherWorkspaces);const endpoint2=calls2.get('teacher:list-assignments')!;await expect(endpoint2.handler('user-1')).rejects.toThrow('Teachers may only view their own teaching assignments.');await expect(endpoint2.handler('other-teacher')).rejects.toThrow('Teachers may only view their own teaching assignments.');await expect(endpoint2.handler('staff-1')).resolves.toEqual([]);});
});
