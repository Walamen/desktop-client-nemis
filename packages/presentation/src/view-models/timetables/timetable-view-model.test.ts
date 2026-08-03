import { describe,expect,it } from 'vitest';
import { DayOfWeek } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { TimetableViewModel } from './timetable-view-model';

describe('TimetableViewModel',()=>{
  it('loads, creates, filters, and refreshes dashboard state through the application layer',async()=>{
    const {app,ports}=createTestApplication();
    ports.timetables.assign('class-1','subject-1','teacher-1');
    const vm=new TimetableViewModel({timetables:app.timetables,notifications:new NotificationStore({success:null,error:null,info:null,warning:null})});
    const outcome=await vm.create({institutionId:'inst-1',classId:'class-1',subjectId:'subject-1',staffId:'teacher-1',dayOfWeek:DayOfWeek.MONDAY,startTime:'08:00',endTime:'08:45'});
    expect(outcome.ok).toBe(true);
    vm.setFilters({classId:'class-1',limit:100,sort:'day'});
    await Promise.all([vm.load(),vm.loadDashboard(),vm.loadConflicts(),vm.loadPeriods('class-1')]);
    const state=vm.store.getState();
    expect(state.entries.status).toBe('success');
    if(state.entries.status==='success')expect(state.entries.data).toHaveLength(1);
    expect(state.conflicts.status).toBe('empty');
    expect(state.periods.status).toBe('success');
  });

  it('loadTeacher fetches a specific teacher\'s own entries without needing setFilters first', async () => {
    const { app, ports } = createTestApplication();
    ports.timetables.assign('class-1', 'subject-1', 'teacher-1');
    const vm = new TimetableViewModel({ timetables: app.timetables, notifications: new NotificationStore({ success: null, error: null, info: null, warning: null }) });
    await vm.create({ institutionId: 'inst-1', classId: 'class-1', subjectId: 'subject-1', staffId: 'teacher-1', dayOfWeek: DayOfWeek.MONDAY, startTime: '08:00', endTime: '08:45' });

    await vm.loadTeacher('teacher-1');

    const state = vm.store.getState();
    expect(state.entries.status).toBe('success');
    if (state.entries.status === 'success') expect(state.entries.data).toHaveLength(1);
  });
});

