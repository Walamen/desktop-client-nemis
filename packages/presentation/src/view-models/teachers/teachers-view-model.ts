import type {
  AssignTeacherDto, CreateTeacherDto, ListTeachersDto, TeacherApplicationService,
  UpdateTeacherDto, UpdateTeachingAssignmentDto,
} from '@nemis-desktop/application';
import type {
  TeacherDashboardResult, TeacherProfileResult, TeacherResult, TeachingAssignmentResult,
} from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { executeCommand, trackQuery, type CommandOutcome } from '../../core/async-runner';
import { createPagination, toPageRequest, withPage, withTotal, type PaginationState } from '../../pagination/pagination';
import { createSearch, withKeyword, type SearchState } from '../../search/search-state';
import type { NotificationStore } from '../../stores/notification-store';

export interface TeacherRowView extends TeacherResult { fullName: string }
export interface TeacherProfileView extends TeacherProfileResult { fullName: string }
export interface TeachersState {
  list: AsyncState<readonly TeacherRowView[]>; profile: AsyncState<TeacherProfileView>;
  assignments: AsyncState<readonly TeachingAssignmentResult[]>; dashboard: AsyncState<TeacherDashboardResult>;
  pagination: PaginationState; search: SearchState; filters: Omit<ListTeachersDto,'limit'|'offset'>;
}
const row=(v:TeacherResult):TeacherRowView=>({...v,fullName:[v.firstName,v.middleName,v.lastName].filter(Boolean).join(' ')});
const profile=(v:TeacherProfileResult):TeacherProfileView=>({...v,fullName:[v.firstName,v.middleName,v.lastName].filter(Boolean).join(' ')});
export class TeachersViewModel {
  readonly store=createStore<TeachersState>(()=>({list:idleState(),profile:idleState(),assignments:idleState(),dashboard:idleState(),pagination:createPagination(),search:createSearch(),filters:{isActive:true}}));
  constructor(private readonly deps:{teachers:TeacherApplicationService;notifications:NotificationStore}){}
  async loadTeachers():Promise<void>{await trackQuery({access:{get:()=>this.store.getState().list,set:list=>this.store.setState({list})},fetch:()=>this.deps.teachers.list({...this.store.getState().filters,...toPageRequest(this.store.getState().pagination)}),map:p=>p.items.map(row),onData:p=>this.store.setState(s=>({pagination:withTotal(s.pagination,p.total)})),isEmpty:r=>r.length===0});}
  async loadProfile(id:string):Promise<void>{await trackQuery({access:{get:()=>this.store.getState().profile,set:profile=>this.store.setState({profile})},fetch:()=>this.deps.teachers.getProfile(id),map:profile});}
  async loadAssignments(id:string):Promise<void>{await trackQuery({access:{get:()=>this.store.getState().assignments,set:assignments=>this.store.setState({assignments})},fetch:()=>this.deps.teachers.getAssignments(id),map:v=>v,isEmpty:v=>v.length===0});}
  async loadDashboard():Promise<void>{await trackQuery({access:{get:()=>this.store.getState().dashboard,set:dashboard=>this.store.setState({dashboard})},fetch:()=>this.deps.teachers.dashboard(),map:v=>v});}
  setKeyword(keyword:string):void{this.store.setState(s=>({search:withKeyword(s.search,keyword),filters:{...s.filters,keyword},pagination:{...s.pagination,page:1}}));}
  setFilters(filters:Omit<ListTeachersDto,'limit'|'offset'>):void{this.store.setState(s=>({filters,pagination:{...s.pagination,page:1}}));}
  async goToPage(page:number):Promise<void>{this.store.setState(s=>({pagination:withPage(s.pagination,page)}));await this.loadTeachers();}
  createTeacher(dto:CreateTeacherDto):Promise<CommandOutcome<TeacherProfileView>>{return this.command(()=>this.deps.teachers.create(dto),'Teacher created.');}
  updateTeacher(dto:UpdateTeacherDto):Promise<CommandOutcome<TeacherProfileView>>{return this.command(()=>this.deps.teachers.update(dto),'Teacher updated.');}
  setActive(teacherId:string,isActive:boolean):Promise<CommandOutcome<TeacherProfileView>>{return this.command(()=>this.deps.teachers.setActive({teacherId,isActive}),isActive?'Teacher restored.':'Teacher archived.');}
  async assign(dto:AssignTeacherDto):Promise<CommandOutcome<TeachingAssignmentResult>>{const o=await executeCommand({run:()=>this.deps.teachers.assign(dto),map:v=>v,notifications:this.deps.notifications,successMessage:'Teaching assignment created.'});if(o.ok)await this.refreshAssignmentViews(dto.teacherId);return o;}
  async updateAssignment(dto:UpdateTeachingAssignmentDto,teacherId:string):Promise<CommandOutcome<TeachingAssignmentResult>>{const o=await executeCommand({run:()=>this.deps.teachers.updateAssignment(dto),map:v=>v,notifications:this.deps.notifications,successMessage:'Teaching assignment updated.'});if(o.ok)await this.refreshAssignmentViews(teacherId);return o;}
  async removeAssignment(assignmentId:string,teacherId:string):Promise<CommandOutcome<{id:string}>>{const o=await executeCommand({run:()=>this.deps.teachers.removeAssignment({assignmentId}),map:v=>v,notifications:this.deps.notifications,successMessage:'Teaching assignment removed.'});if(o.ok)await this.refreshAssignmentViews(teacherId);return o;}
  async bulkArchive(ids:readonly string[]):Promise<void>{for(const id of ids)await this.deps.teachers.setActive({teacherId:id,isActive:false});this.deps.notifications.success(`${ids.length} teacher(s) archived.`);await this.loadTeachers();}
  private async command(run:()=>ReturnType<TeacherApplicationService['create']>,message:string):Promise<CommandOutcome<TeacherProfileView>>{const o=await executeCommand({run,map:v=>profile({...v,assignments:[]}),notifications:this.deps.notifications,successMessage:message});if(o.ok)await this.loadTeachers();return o;}
  private async refreshAssignmentViews(id:string):Promise<void>{await Promise.all([this.loadAssignments(id),this.loadProfile(id),this.loadDashboard()]);}
}

export class TeachersListViewModel { readonly store; readonly selection=createStore<{selectedIds:ReadonlySet<string>}>(()=>({selectedIds:new Set()})); constructor(private core:TeachersViewModel){this.store=core.store;} loadTeachers=()=>this.core.loadTeachers();goToPage=(p:number)=>this.core.goToPage(p);createTeacher=(d:CreateTeacherDto)=>this.core.createTeacher(d);bulkArchive=(ids:readonly string[])=>this.core.bulkArchive(ids);toggleSelection(id:string){this.selection.setState(s=>{const n=new Set(s.selectedIds);if(n.has(id))n.delete(id);else n.add(id);return{selectedIds:n};});}clearSelection(){this.selection.setState({selectedIds:new Set()});}}
export class TeacherProfileViewModel { readonly store;constructor(private core:TeachersViewModel){this.store=core.store;}loadProfile=(id:string)=>this.core.loadProfile(id);updateTeacher=(d:UpdateTeacherDto)=>this.core.updateTeacher(d);setActive=(id:string,a:boolean)=>this.core.setActive(id,a);}
export class TeachingAssignmentViewModel { readonly store;constructor(private core:TeachersViewModel){this.store=core.store;}load=(id:string)=>this.core.loadAssignments(id);assign=(d:AssignTeacherDto)=>this.core.assign(d);update=(d:UpdateTeachingAssignmentDto,id:string)=>this.core.updateAssignment(d,id);remove=(a:string,t:string)=>this.core.removeAssignment(a,t);}
export class TeacherSearchViewModel { readonly store;constructor(private core:TeachersViewModel){this.store=core.store;}setKeyword=(v:string)=>this.core.setKeyword(v);setFilters=(v:Omit<ListTeachersDto,'limit'|'offset'>)=>this.core.setFilters(v);search=()=>this.core.loadTeachers();}
export class TeacherDashboardViewModel { readonly store;constructor(private core:TeachersViewModel){this.store=core.store;}load=()=>this.core.loadDashboard();}
