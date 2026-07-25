import { TimetableEntry } from '@nemis-desktop/domain';
import type { ITimetableRepository, TimetablePageFilter } from '../../interfaces/timetables';
import type {
  CopyTimetableRequest, PeriodResult, ScheduleConflictResult,
  TimetableDashboardResult, TimetableEntryResult,
} from '@nemis-desktop/types';

export class InMemoryTimetableRepository implements ITimetableRepository {
  readonly store=new Map<string,TimetableEntry>();
  readonly assignments=new Set<string>();
  assign(classId:string,subjectId:string,staffId:string):void{this.assignments.add(`${classId}:${subjectId}:${staffId}`);}
  findById(id:string):TimetableEntry|null{return this.store.get(id)??null;}
  findPage(filter:TimetablePageFilter):{items:TimetableEntryResult[];total:number}{
    let values=[...this.store.values()];
    if(filter.classId)values=values.filter(v=>v.data.classId===filter.classId);
    if(filter.teacherId)values=values.filter(v=>v.data.staffId===filter.teacherId);
    if(filter.subjectId)values=values.filter(v=>v.data.subjectId===filter.subjectId);
    if(filter.dayOfWeek)values=values.filter(v=>v.data.dayOfWeek===filter.dayOfWeek);
    const items=values.sort((a,b)=>a.data.startTime.localeCompare(b.data.startTime)).map(v=>this.result(v));
    return{items:items.slice(filter.offset,filter.offset+filter.limit),total:items.length};
  }
  save(entry:TimetableEntry):TimetableEntryResult{this.store.set(entry.id,entry);return this.result(entry);}
  remove(id:string):void{this.store.delete(id);}
  hasAssignment(classId:string,subjectId:string,staffId:string):boolean{return this.assignments.has(`${classId}:${subjectId}:${staffId}`);}
  detectConflicts(entry:TimetableEntry,excludeId?:string):ScheduleConflictResult[]{
    const p=entry.data;const found:ScheduleConflictResult[]=[];
    for(const other of this.store.values()){
      if(other.id===excludeId||!entry.overlaps(other.data))continue;
      if(other.data.classId===p.classId)found.push({type:'TIME_SLOT_CONFLICT',message:'Class already has an overlapping entry.',conflictingEntryId:other.id,dayOfWeek:p.dayOfWeek,startTime:p.startTime,endTime:p.endTime});
      else if(!p.isBreak&&!other.data.isBreak&&p.staffId&&p.staffId===other.data.staffId)found.push({type:'TEACHER_CONFLICT',message:'Teacher already has an overlapping entry.',conflictingEntryId:other.id,dayOfWeek:p.dayOfWeek,startTime:p.startTime,endTime:p.endTime});
    }
    return found;
  }
  copy(request:CopyTimetableRequest,ids:readonly string[],now:string):TimetableEntryResult[]{
    const source=[...this.store.values()].filter(v=>v.data.classId===request.sourceClassId);
    return source.map((value,index)=>{
      const p=value.data;
      const prefix=`${request.targetClassId}:${p.subjectId??''}:`;
      const destinationAssignment=p.isBreak?undefined:[...this.assignments].find(v=>v.startsWith(prefix));
      if(!p.isBreak&&!destinationAssignment)throw new Error('Teacher assignment is missing in the destination class.');
      const destinationStaffId=destinationAssignment?.slice(prefix.length);
      const entry=TimetableEntry.create({...p,id:ids[index]!,classId:request.targetClassId,staffId:destinationStaffId,createdAt:now,updatedAt:now});
      const result=this.detectConflicts(entry);if(result.length)throw new Error(result[0]!.message);
      return this.save(entry);
    });
  }
  periods(classId?:string):PeriodResult[]{
    const keys=new Map<string,{startTime:string;endTime:string;isBreak:boolean}>();
    for(const value of this.store.values()){const p=value.data;if(classId&&p.classId!==classId)continue;keys.set(`${p.startTime}-${p.endTime}`,{startTime:p.startTime,endTime:p.endTime,isBreak:p.isBreak});}
    return[...keys.values()].sort((a,b)=>a.startTime.localeCompare(b.startTime)).map((v,i)=>({...v,order:i+1}));
  }
  dashboard(today:string):TimetableDashboardResult{
    const values=[...this.store.values()];const todayValues=values.filter(v=>v.data.dayOfWeek===today);
    return{totalEntries:values.length,classesWithSchedules:new Set(values.map(v=>v.data.classId)).size,todayEntries:todayValues.length,classesScheduledToday:new Set(todayValues.map(v=>v.data.classId)).size,pendingConflicts:0,teacherWorkload:[]};
  }
  private result(entry:TimetableEntry):TimetableEntryResult{
    const p=entry.data;return{...p,version:1,academicYearId:'year-1',academicYearName:'2026/2027',className:p.classId,gradeLevel:'GRADE_1',subjectName:p.subjectId,teacherName:p.staffId};
  }
}
