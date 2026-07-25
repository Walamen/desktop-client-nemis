import { describe,expect,it,vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import type { IpcHandle,IpcValidator } from '../registrar';
import { registerTeacherHandlers } from './teachers';
describe('teacher IPC handlers',()=>{
  it('validates and forwards assignment requests',async()=>{const calls=new Map<string,{validate:IpcValidator;handler:(...a:unknown[])=>unknown}>();const handle=((channel:IpcChannel,validate:IpcValidator,handler:unknown)=>calls.set(channel,{validate,handler:handler as (...a:unknown[])=>unknown})) as IpcHandle;const assign=vi.fn(async()=>({data:{id:'a1'}}));registerTeacherHandlers(handle,{teachers:{assign}} as unknown as ApplicationLayer);const endpoint=calls.get('teacher:assign')!;expect(()=>endpoint.validate([{teacherId:'t1',classId:'c1',subjectId:'s1'}])).not.toThrow();expect(()=>endpoint.validate([{teacherId:'t1'}])).toThrow();await endpoint.handler({teacherId:'t1',classId:'c1',subjectId:'s1'});expect(assign).toHaveBeenCalled();});
});
