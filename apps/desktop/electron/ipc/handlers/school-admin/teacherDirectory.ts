import { ForbiddenError } from '@nemis-desktop/shared';
import { IpcChannels, SystemRole } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import {
  assertAssignTeacherArgs, assertCreateTeacherArgs, assertListTeachersArgs,
  assertRemoveTeachingAssignmentArgs, assertSetTeacherActiveArgs,
  assertSingleIdArg, assertUpdateTeacherArgs, assertUpdateTeachingAssignmentArgs,
} from '@app/security/validateIpc';

/** Staff-directory management — school admins creating/editing teacher
 * records and teaching assignments. The teacher's own dashboard is
 * registered separately, see
 * electron/ipc/handlers/teacher/dashboard.ts. TEACHER_LIST_ASSIGNMENTS is
 * the exception: authorizeChannel.ts opens it to TEACHER too (the teacher
 * portal's own dashboard reads it for "my classes"), so this handler
 * self-scopes a TEACHER caller to their own id — an admin may still look up
 * any teacher in the institution. */
export function registerTeacherDirectoryHandlers(handle:IpcHandle,app:ApplicationLayer,workspaces:WorkspaceManager):void{
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
  handle(IpcChannels.TEACHER_LIST_ASSIGNMENTS,assertSingleIdArg,async id=>{
    const user=workspaces.active.user;
    // user.id is the login (`users` table) identity; teaching assignments are
    // keyed by the linked staff record (`staff.id` / user.staffId) — the same
    // distinction the renderer resolves before calling this channel.
    if(user.role===SystemRole.TEACHER&&id!==user.staffId){
      throw new ForbiddenError('Teachers may only view their own teaching assignments.');
    }
    return (await app.teachers.getAssignments(id)).data;
  });
  handle(IpcChannels.TEACHER_ASSIGN,assertAssignTeacherArgs,async r=>(await app.teachers.assign(r)).data);
  handle(IpcChannels.TEACHER_UPDATE_ASSIGNMENT,assertUpdateTeachingAssignmentArgs,async r=>(await app.teachers.updateAssignment(r)).data);
  handle(IpcChannels.TEACHER_REMOVE_ASSIGNMENT,assertRemoveTeachingAssignmentArgs,async r=>(await app.teachers.removeAssignment(r)).data);
}
