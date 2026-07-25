'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle, CalendarDays, Clock3, Copy, Pencil, Plus, Search, Trash2, Users,
} from 'lucide-react';
import {
  DayOfWeek,
  GradeLevel,
  type CreateTimetableEntryRequest,
  type DayOfWeek as DayValue,
  type ScheduleConflictResult,
  type TimetableDashboardResult,
  type TimetableEntryResult,
  type UpdateTimetableEntryRequest,
} from '@nemis-desktop/types';
import type { AsyncState } from '@nemis-desktop/presentation';
import { Badge, Button, EmptyState, ErrorState, Input, Modal, Select, Skeleton } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import {
  useAcademicFoundationViewModel,
  useSettingsViewModel,
  useTeachersListViewModel,
  useTimetableViewModel,
} from '@/lib/presentation/hooks';

const DAYS = Object.values(DayOfWeek);
const human = (value:string) => value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const rows = <T,>(state:{status:string;data?:readonly T[]}) =>
  state.status==='success'||state.status==='refreshing' ? state.data??[] : [];
const labelClass = (value:{name:string;section?:string}) =>
  `${value.name}${value.section ? ` — ${value.section}` : ''}`;

type Tab = 'school'|'class'|'teacher'|'subject';

export default function TimetablePage(){
  const timetable=useTimetableViewModel();
  const foundation=useAcademicFoundationViewModel();
  const teachersVm=useTeachersListViewModel();
  const settings=useSettingsViewModel();
  const entries=useViewModel(timetable.store,s=>s.entries);
  const conflicts=useViewModel(timetable.store,s=>s.conflicts);
  const dashboard=useViewModel(timetable.store,s=>s.dashboard);
  const periods=useViewModel(timetable.store,s=>s.periods);
  const filters=useViewModel(timetable.store,s=>s.filters);
  const total=useViewModel(timetable.store,s=>s.total);
  const classesState=useViewModel(foundation.store,s=>s.classes);
  const subjectsState=useViewModel(foundation.store,s=>s.subjects);
  const yearsState=useViewModel(foundation.store,s=>s.academicYears);
  const teachersState=useViewModel(teachersVm.store,s=>s.list);
  const school=useViewModel(settings.store,s=>s.profile);
  const classes=rows(classesState),subjects=rows(subjectsState),years=rows(yearsState),teachers=rows(teachersState);
  const schedule=rows(entries);
  const [tab,setTab]=useState<Tab>('school');
  const [editor,setEditor]=useState<TimetableEntryResult|'new'|null>(null);
  const [copyOpen,setCopyOpen]=useState(false);

  useEffect(()=>{
    void timetable.load();void timetable.loadDashboard();void timetable.loadConflicts();void timetable.loadPeriods();
    void foundation.loadAcademicYears();void foundation.loadClasses();void foundation.loadSubjects();void teachersVm.loadTeachers();void settings.loadCurrentSchool();
  },[timetable,foundation,teachersVm,settings]);

  const apply=(next:typeof filters)=>{
    timetable.setFilters(next);void timetable.load();void timetable.loadConflicts();void timetable.loadPeriods(next.classId);
  };
  const switchTab=(next:Tab)=>{setTab(next);apply({limit:100,offset:0,sort:'day'});};
  const status=entries.status;

  return <div className="p-6 space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Timetable Management</h1>
        <p className="text-sm text-slate-500">Authoritative offline weekly scheduling for classes, teachers, and subjects.</p></div>
      <div className="flex gap-2"><Button variant="secondary" onClick={()=>setCopyOpen(true)}><Copy className="w-4 h-4"/>Copy timetable</Button><Button onClick={()=>setEditor('new')}><Plus className="w-4 h-4"/>Add entry</Button></div>
    </header>

    <Dashboard state={dashboard}/>

    <div className="bg-white border rounded-card p-1 flex flex-wrap gap-1">
      {(['school','class','teacher','subject'] as Tab[]).map(value=>
        <button key={value} onClick={()=>switchTab(value)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab===value?'bg-slate-900 text-white':'text-slate-600 hover:bg-slate-100'}`}>{human(value)} timetable</button>)}
    </div>

    <section className="bg-white border rounded-card p-4 grid md:grid-cols-4 gap-3">
      <div className="relative md:col-span-2"><Search className="absolute left-3 top-3 w-4 h-4 text-slate-400"/><Input className="pl-9" placeholder="Search class, teacher, subject, or room" value={filters.keyword??''} onChange={e=>timetable.setFilters({...filters,keyword:e.target.value||undefined})} onKeyDown={e=>{if(e.key==='Enter')void timetable.load();}}/></div>
      {(tab==='school'||tab==='class')&&<Select options={[{value:'',label:'All classes'},...classes.map(v=>({value:v.id,label:labelClass(v)}))]} value={filters.classId??''} onChange={e=>apply({...filters,classId:e.target.value||undefined})}/>}
      {(tab==='school'||tab==='teacher')&&<Select options={[{value:'',label:'All teachers'},...teachers.map(v=>({value:v.id,label:v.fullName}))]} value={filters.teacherId??''} onChange={e=>apply({...filters,teacherId:e.target.value||undefined})}/>}
      {(tab==='school'||tab==='subject')&&<Select options={[{value:'',label:'All subjects'},...subjects.map(v=>({value:v.id,label:v.name}))]} value={filters.subjectId??''} onChange={e=>apply({...filters,subjectId:e.target.value||undefined})}/>}
      <Select options={[{value:'',label:'All weekdays'},...DAYS.map(v=>({value:v,label:human(v)}))]} value={filters.dayOfWeek??''} onChange={e=>apply({...filters,dayOfWeek:(e.target.value||undefined) as DayValue|undefined})}/>
      <Select options={[{value:'',label:'All academic years'},...years.map(v=>({value:v.id,label:v.code}))]} value={filters.academicYearId??''} onChange={e=>apply({...filters,academicYearId:e.target.value||undefined})}/>
      <Select options={[{value:'',label:'All grade levels'},...Object.values(GradeLevel).map(v=>({value:v,label:human(v)}))]} value={filters.gradeLevel??''} onChange={e=>apply({...filters,gradeLevel:(e.target.value||undefined) as typeof filters.gradeLevel})}/>
      <Button variant="secondary" onClick={()=>void timetable.load()}>Search</Button>
    </section>

    {(status==='idle'||status==='loading')&&<Skeleton className="h-80 w-full"/>}
    {status==='error'&&<ErrorState message={entries.error.userMessage} onRetry={()=>void timetable.load()}/>}
    {status==='empty'&&<EmptyState title="No timetable has been created." description="Add a lesson or break to begin the weekly schedule." action={<Button onClick={()=>setEditor('new')}>Add first entry</Button>}/>}
    {(status==='success'||status==='refreshing')&&<>
      <WeeklyCalendar entries={schedule} onEdit={setEditor}/>
      <Directory entries={schedule} total={total} offset={filters.offset??0} limit={filters.limit??100} onPage={offset=>apply({...filters,offset})} onEdit={setEditor} onRemove={id=>void timetable.remove(id)}/>
    </>}

    <div className="grid lg:grid-cols-2 gap-5">
      <PeriodPanel periods={rows(periods)}/>
      <ConflictPanel state={conflicts}/>
    </div>

    {editor&&<EntryEditor entry={editor==='new'?undefined:editor} schoolId={(school.status==='success'||school.status==='refreshing')?school.data.id:''} classes={classes} subjects={subjects} teachers={teachers} onClose={()=>setEditor(null)} onSave={async dto=>{
      const outcome='id' in dto?await timetable.update(dto):await timetable.create(dto);
      if(outcome.ok)setEditor(null);
    }}/>}
    {copyOpen&&<CopyDialog classes={classes} onClose={()=>setCopyOpen(false)} onCopy={async(sourceClassId,targetClassId)=>{const result=await timetable.copy({sourceClassId,targetClassId});if(result.ok)setCopyOpen(false);}}/>}
  </div>;
}

function Dashboard({state}:{state:AsyncState<TimetableDashboardResult>}){
  if(state.status==='idle'||state.status==='loading')return <Skeleton className="h-28 w-full"/>;
  if(state.status==='error'||state.status==='empty')return null;
  const value=state.data;
  const cards=[
    ['Total entries',value.totalEntries,CalendarDays],
    ["Today's schedule",value.todayEntries,Clock3],
    ['Classes today',value.classesScheduledToday,Users],
    ['Pending conflicts',value.pendingConflicts,AlertTriangle],
  ] as const;
  return <><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{cards.map(([label,count,Icon])=><div key={label} className="bg-white border rounded-card p-4"><div className="flex items-center justify-between"><p className="text-sm text-slate-500">{label}</p><Icon className="w-5 h-5 text-sky-600"/></div><p className="text-3xl font-semibold mt-2">{count}</p></div>)}</div>
    {value.teacherWorkload.length>0&&<div className="bg-white border rounded-card px-4 py-3 flex flex-wrap gap-3 text-sm"><span className="font-medium">Teacher workload:</span>{value.teacherWorkload.map(v=><span key={v.teacherId} className="text-slate-600">{v.teacherName} <Badge variant="neutral">{v.lessons}</Badge></span>)}</div>}</>;
}

function WeeklyCalendar({entries,onEdit}:{entries:readonly TimetableEntryResult[];onEdit:(entry:TimetableEntryResult)=>void}){
  const slots=useMemo(()=>[...new Map(entries.map(v=>[`${v.startTime}-${v.endTime}`,{start:v.startTime,end:v.endTime}])).values()].sort((a,b)=>a.start.localeCompare(b.start)),[entries]);
  return <section className="bg-white border rounded-card overflow-hidden"><div className="p-4 border-b"><h2 className="font-semibold">Weekly schedule</h2><p className="text-sm text-slate-500">Select an occupied cell to edit it.</p></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-sm"><thead><tr className="bg-slate-50 border-b"><th className="p-3 text-left w-32">Period</th>{DAYS.map(day=><th key={day} className="p-3 text-left">{human(day)}</th>)}</tr></thead>
      <tbody>{slots.map(slot=><tr key={`${slot.start}-${slot.end}`} className="border-b align-top"><td className="p-3 font-medium whitespace-nowrap">{slot.start}–{slot.end}</td>{DAYS.map(day=>{const cell=entries.filter(v=>v.dayOfWeek===day&&v.startTime===slot.start&&v.endTime===slot.end);return <td key={day} className="p-2">{cell.map(v=><button key={v.id} onClick={()=>onEdit(v)} className={`w-full text-left rounded-lg p-2 mb-1 border ${v.isBreak?'bg-amber-50 border-amber-200':'bg-sky-50 border-sky-200'}`}><span className="font-medium block">{v.isBreak?'Break':v.subjectName}</span><span className="text-xs text-slate-600 block">{v.className}{v.section?` — ${v.section}`:''}</span>{v.teacherName&&<span className="text-xs text-slate-500 block">{v.teacherName}{v.room?` · ${v.room}`:''}</span>}</button>)}</td>})}</tr>)}</tbody></table></div>
  </section>;
}

function Directory({entries,total,offset,limit,onPage,onEdit,onRemove}:{entries:readonly TimetableEntryResult[];total:number;offset:number;limit:number;onPage:(offset:number)=>void;onEdit:(v:TimetableEntryResult)=>void;onRemove:(id:string)=>void}){
  return <section className="bg-white border rounded-card overflow-hidden"><div className="p-4 border-b"><h2 className="font-semibold">Timetable directory</h2><p className="text-sm text-slate-500">{total} matching entries</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b bg-slate-50"><th className="p-3">Day / time</th><th>Class</th><th>Subject</th><th>Teacher</th><th>Room</th><th></th></tr></thead><tbody>{entries.map(v=><tr key={v.id} className="border-b"><td className="p-3">{human(v.dayOfWeek)}<span className="block text-xs text-slate-500">{v.startTime}–{v.endTime}</span></td><td>{v.className}{v.section?` — ${v.section}`:''}</td><td>{v.isBreak?<Badge variant="warning">Break</Badge>:v.subjectName}</td><td>{v.teacherName??'—'}</td><td>{v.room??'—'}</td><td><div className="flex gap-1"><Button size="sm" variant="secondary" onClick={()=>onEdit(v)} aria-label="Edit entry"><Pencil className="w-3 h-3"/></Button><Button size="sm" variant="destructive" onClick={()=>onRemove(v.id)} aria-label="Delete entry"><Trash2 className="w-3 h-3"/></Button></div></td></tr>)}</tbody></table></div><div className="p-3 flex justify-between items-center text-sm text-slate-500"><span>{total===0?0:offset+1}–{Math.min(offset+entries.length,total)} of {total}</span><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={offset===0} onClick={()=>onPage(Math.max(0,offset-limit))}>Previous</Button><Button size="sm" variant="secondary" disabled={offset+limit>=total} onClick={()=>onPage(offset+limit)}>Next</Button></div></div></section>;
}

function PeriodPanel({periods}:{periods:readonly {startTime:string;endTime:string;isBreak:boolean;order:number}[]}){
  return <section className="bg-white border rounded-card p-5"><h2 className="font-semibold">Period management / bell schedule</h2><p className="text-xs text-slate-500 mt-1">Derived from persisted timetable entries, matching the backend model.</p>{periods.length===0?<p className="text-sm text-slate-500 mt-5">No periods have been created.</p>:<div className="mt-4 space-y-2">{periods.map(v=><div key={`${v.startTime}-${v.endTime}`} className="flex justify-between border-b py-2 text-sm"><span>{v.isBreak?'Break':`Period ${v.order}`}</span><span className="text-slate-500">{v.startTime}–{v.endTime}</span></div>)}</div>}</section>;
}

function ConflictPanel({state}:{state:AsyncState<readonly ScheduleConflictResult[]>}){
  const values=rows(state);
  return <section className="bg-white border rounded-card p-5"><h2 className="font-semibold">Schedule validation</h2>{state.status==='loading'||state.status==='idle'?<Skeleton className="h-24 w-full mt-4"/>:state.status==='error'?<p className="text-sm text-red-700 mt-4">{state.error.userMessage}</p>:values.length===0?<p className="text-sm text-emerald-700 mt-4">No conflicts detected.</p>:<ul className="mt-4 space-y-2">{values.map((v,i)=><li key={`${v.type}-${i}`} className="text-sm bg-red-50 border border-red-200 rounded-lg p-3"><b>{human(v.type)}:</b> {v.message}</li>)}</ul>}</section>;
}

interface Option {id:string;name:string;section?:string}
interface TeacherOption {id:string;fullName:string}
function EntryEditor({entry,schoolId,classes,subjects,teachers,onClose,onSave}:{entry?:TimetableEntryResult;schoolId:string;classes:readonly Option[];subjects:readonly Option[];teachers:readonly TeacherOption[];onClose:()=>void;onSave:(dto:CreateTimetableEntryRequest|UpdateTimetableEntryRequest)=>Promise<void>}){
  const [classId,setClassId]=useState(entry?.classId??'');
  const [subjectId,setSubjectId]=useState(entry?.subjectId??'');
  const [staffId,setStaffId]=useState(entry?.staffId??'');
  const [day,setDay]=useState<DayValue>(entry?.dayOfWeek??DayOfWeek.MONDAY);
  const [start,setStart]=useState(entry?.startTime??'08:00');
  const [end,setEnd]=useState(entry?.endTime??'08:45');
  const [room,setRoom]=useState(entry?.room??'');
  const [isBreak,setBreak]=useState(entry?.isBreak??false);
  const submit=(event:FormEvent)=>{event.preventDefault();const common={classId,subjectId:isBreak?undefined:subjectId,staffId:isBreak?undefined:staffId,dayOfWeek:day,startTime:start,endTime:end,room:isBreak?undefined:room||undefined,isBreak};void onSave(entry?{id:entry.id,...common}:{institutionId:schoolId,...common});};
  return <Modal isOpen onClose={onClose} title={entry?'Edit timetable entry':'Create timetable wizard'} footer={<Button form="timetable-entry" type="submit" disabled={!schoolId||!classId||(!isBreak&&(!subjectId||!staffId))}>Save entry</Button>}><form id="timetable-entry" onSubmit={submit} className="space-y-3">
    <Select label="Class" required value={classId} onChange={e=>setClassId(e.target.value)} options={classes.map(v=>({value:v.id,label:labelClass(v)}))}/>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isBreak} onChange={e=>setBreak(e.target.checked)}/>This entry is a break, lunch, or assembly period</label>
    {!isBreak&&<><Select label="Subject" required value={subjectId} onChange={e=>setSubjectId(e.target.value)} options={subjects.map(v=>({value:v.id,label:v.name}))}/><Select label="Teacher" required value={staffId} onChange={e=>setStaffId(e.target.value)} options={teachers.map(v=>({value:v.id,label:v.fullName}))}/><Input label="Room (optional)" value={room} onChange={e=>setRoom(e.target.value)}/></>}
    <Select label="Day" value={day} onChange={e=>setDay(e.target.value as DayValue)} options={DAYS.map(v=>({value:v,label:human(v)}))}/>
    <div className="grid grid-cols-2 gap-3"><Input label="Start time" type="time" required value={start} onChange={e=>setStart(e.target.value)}/><Input label="End time" type="time" required value={end} onChange={e=>setEnd(e.target.value)}/></div>
    <div className="rounded-lg border bg-slate-50 p-3 text-sm"><p className="text-xs uppercase tracking-wider text-slate-400">Schedule preview</p><p className="font-medium mt-1">{human(day)} · {start}–{end}</p><p className="text-slate-600">{classes.find(v=>v.id===classId)?.name??'Select a class'} · {isBreak?'Break':subjects.find(v=>v.id===subjectId)?.name??'Select a subject'}</p></div>
    {!schoolId&&<p className="text-sm text-red-700">A provisioned school profile is required.</p>}
  </form></Modal>;
}

function CopyDialog({classes,onClose,onCopy}:{classes:readonly Option[];onClose:()=>void;onCopy:(source:string,target:string)=>Promise<void>}){
  const [source,setSource]=useState(''),[target,setTarget]=useState('');
  return <Modal isOpen onClose={onClose} title="Copy class timetable" footer={<Button disabled={!source||!target||source===target} onClick={()=>void onCopy(source,target)}>Copy schedule</Button>}><div className="space-y-3"><p className="text-sm text-slate-500">Teacher assignments must already exist in the destination class. The copy is atomic and will stop if any conflict is found.</p><Select label="Source class" value={source} onChange={e=>setSource(e.target.value)} options={classes.map(v=>({value:v.id,label:labelClass(v)}))}/><Select label="Destination class" value={target} onChange={e=>setTarget(e.target.value)} options={classes.map(v=>({value:v.id,label:labelClass(v)}))}/></div></Modal>;
}
