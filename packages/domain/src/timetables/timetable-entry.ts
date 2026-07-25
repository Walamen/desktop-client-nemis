import type { DayOfWeek } from '@nemis-desktop/types';
import { BusinessRuleViolationException, EntityValidationException } from '../exceptions';
import { Entity } from '../core';

export interface TimetableEntryProps {
  id: string;
  institutionId: string;
  classId: string;
  subjectId?: string;
  staffId?: string;
  assignmentId?: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  room?: string;
  isBreak: boolean;
  createdAt: string;
  updatedAt: string;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class TimetableEntry extends Entity<string> {
  private constructor(private props: TimetableEntryProps) {
    super(props.id);
  }

  static create(props: TimetableEntryProps): TimetableEntry {
    const entry = new TimetableEntry({ ...props });
    entry.validate();
    return entry;
  }

  static reconstitute(props: TimetableEntryProps): TimetableEntry {
    return TimetableEntry.create(props);
  }

  get data(): Readonly<TimetableEntryProps> { return this.props; }

  update(
    changes: Partial<Omit<TimetableEntryProps, 'id' | 'institutionId' | 'createdAt'>>,
    now: string,
  ): void {
    this.props = { ...this.props, ...changes, updatedAt: now };
    this.validate();
  }

  overlaps(other: Pick<TimetableEntryProps, 'dayOfWeek' | 'startTime' | 'endTime'>): boolean {
    return this.props.dayOfWeek === other.dayOfWeek
      && this.props.startTime < other.endTime
      && this.props.endTime > other.startTime;
  }

  private validate(): void {
    if (!this.props.institutionId || !this.props.classId) {
      throw new EntityValidationException('Timetable entry is invalid.', [
        { field: 'classId', message: 'A school and class are required.' },
      ]);
    }
    if (!TIME.test(this.props.startTime) || !TIME.test(this.props.endTime)
      || this.props.endTime <= this.props.startTime) {
      throw new EntityValidationException('Timetable entry is invalid.', [
        { field: 'endTime', message: 'Enter a valid period whose end is after its start.' },
      ]);
    }
    if (this.props.isBreak) {
      this.props = {
        ...this.props,
        subjectId: undefined,
        staffId: undefined,
        assignmentId: undefined,
        room: undefined,
      };
      return;
    }
    if (!this.props.subjectId || !this.props.staffId) {
      throw new BusinessRuleViolationException(
        'A lesson requires both an assigned subject and teacher.',
      );
    }
    this.props = { ...this.props, room: this.props.room?.trim() || undefined };
  }
}

