import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertAssignTeacherArgs, assertCreateTeacherArgs, assertListTeachersArgs,
  assertNoArgs, assertRemoveTeachingAssignmentArgs, assertSetTeacherActiveArgs,
  assertSingleIdArg, assertUpdateTeacherArgs, assertUpdateTeachingAssignmentArgs,
} from '@app/security/validateIpc';

export function registerTeacherHandlers(handle:IpcHandle,app:ApplicationLayer):void{
  handle(IpcChannels.TEACHER_LIST,assertListTeachersArgs,async r=>(await app.teachers.list(r)).data);
  handle(IpcChannels.TEACHER_GET_PROFILE,assertSingleIdArg,async id=>(await app.teachers.getProfile(id)).data);
  handle(IpcChannels.TEACHER_CREATE,assertCreateTeacherArgs,async r=>{
    const created=(await app.teachers.create(r)).data;
    return (await app.teachers.getProfile(created.id)).data!;
  });
  handle(IpcChannels.TEACHER_UPDATE,assertUpdateTeacherArgs,async r=>{
    const updated=(await app.teachers.update(r)).data;
    return (await app.teachers.getProfile(updated.id)).data!;
  });
  handle(IpcChannels.TEACHER_SET_ACTIVE,assertSetTeacherActiveArgs,async r=>{
    const updated=(await app.teachers.setActive(r)).data;
    return (await app.teachers.getProfile(updated.id)).data!;
  });
  handle(IpcChannels.TEACHER_LIST_ASSIGNMENTS,assertSingleIdArg,async id=>(await app.teachers.getAssignments(id)).data);
  handle(IpcChannels.TEACHER_ASSIGN,assertAssignTeacherArgs,async r=>(await app.teachers.assign(r)).data);
  handle(IpcChannels.TEACHER_UPDATE_ASSIGNMENT,assertUpdateTeachingAssignmentArgs,async r=>(await app.teachers.updateAssignment(r)).data);
  handle(IpcChannels.TEACHER_REMOVE_ASSIGNMENT,assertRemoveTeachingAssignmentArgs,async r=>(await app.teachers.removeAssignment(r)).data);
  handle(IpcChannels.TEACHER_GET_DASHBOARD,assertNoArgs,async ()=>(await app.teachers.dashboard()).data);
}
