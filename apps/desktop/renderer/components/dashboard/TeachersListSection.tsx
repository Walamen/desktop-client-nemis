'use client';
import { useEffect } from 'react';
import { Card, ErrorState, Skeleton } from '@nemis-desktop/ui';
import { Users } from 'lucide-react';
import { useTeacherDashboardViewModel } from '@/lib/presentation/hooks';
import { useViewModel } from '@/hooks/use-view-model';
const human=(v:string)=>v.replaceAll('_',' ');
export default function TeachersListSection(){
  const vm=useTeacherDashboardViewModel(),state=useViewModel(vm.store,s=>s.dashboard);
  useEffect(()=>{if(state.status==='idle')void vm.load();},[vm,state.status]);
  if(state.status==='loading'||state.status==='idle')return <Skeleton className="h-48 w-full"/>;
  if(state.status==='error')return <ErrorState message={state.error.userMessage} onRetry={()=>void vm.load()}/>;
  if(state.status==='empty')return null;
  const d=state.data;
  return <div className="grid lg:grid-cols-3 gap-4">
    <Card><h2 className="font-semibold flex gap-2"><Users className="w-5"/>Teaching Assignment Summary</h2><p className="text-3xl font-semibold mt-4">{d.totalAssignments}</p><p className="text-sm text-slate-500">active class and subject assignments</p><p className="text-sm mt-3">{d.unassignedTeachers} unassigned teacher(s)</p></Card>
    <Card><h2 className="font-semibold">Teachers by Subject</h2>{d.bySubject.length===0?<p className="text-sm text-slate-500 mt-4">No teachers assigned to a subject.</p>:d.bySubject.slice(0,6).map(v=><div key={v.subjectId} className="flex justify-between border-b py-2 text-sm"><span>{v.subjectName}</span><strong>{v.teacherCount}</strong></div>)}</Card>
    <Card><h2 className="font-semibold">Employment Status</h2>{d.byEmploymentStatus.length===0?<p className="text-sm text-slate-500 mt-4">No teachers found.</p>:d.byEmploymentStatus.map(v=><div key={v.employmentType} className="flex justify-between border-b py-2 text-sm"><span>{human(v.employmentType)}</span><strong>{v.teacherCount}</strong></div>)}</Card>
    <Card><h2 className="font-semibold">Teachers by Grade</h2>{d.byGrade.length===0?<p className="text-sm text-slate-500 mt-4">No grade assignments.</p>:d.byGrade.map(v=><div key={v.gradeLevel} className="flex justify-between border-b py-2 text-sm"><span>{human(v.gradeLevel)}</span><strong>{v.teacherCount}</strong></div>)}</Card>
    <Card className="lg:col-span-2"><h2 className="font-semibold">Recently Added Teachers</h2>{d.recentlyAdded.length===0?<p className="text-sm text-slate-500 mt-4">No teachers found.</p>:d.recentlyAdded.map(v=><a href={`/government/school-admin/teachers-staff/profile?id=${v.id}`} key={v.id} className="flex justify-between border-b py-2 text-sm text-blue-700"><span>{v.firstName} {v.lastName}</span><span>{v.employeeNumber}</span></a>)}</Card>
  </div>;
}
