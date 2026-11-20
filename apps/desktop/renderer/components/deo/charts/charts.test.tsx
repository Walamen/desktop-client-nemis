import { describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import EnrollmentBySchoolChart from './EnrollmentBySchoolChart';
import AttendanceComparisonChart from './AttendanceComparisonChart';
import SchoolComparisonChart from './SchoolComparisonChart';
import AttendanceTrendChart from './AttendanceTrendChart';

// jsdom has no layout, so give ResponsiveContainer a fixed size.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  const { cloneElement } = await import('react');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      cloneElement(children as ReactElement<{ width?: number; height?: number }>, {
        width: 600,
        height: 400,
      }),
  };
});

describe('EnrollmentBySchoolChart', () => {
  it('renders with data', () => {
    const { container } = render(
      <EnrollmentBySchoolChart data={[{ name: 'Alpha School', enrollment: 120 }]} />,
    );
    expect(container.querySelector('.recharts-wrapper')).not.toBeNull();
  });
  it('renders an empty state with no data', () => {
    const { getByText } = render(<EnrollmentBySchoolChart data={[]} />);
    expect(getByText('No school enrollment data')).toBeTruthy();
  });
});

describe('AttendanceComparisonChart', () => {
  it('renders with data', () => {
    const { container } = render(
      <AttendanceComparisonChart
        data={[
          { name: 'Alpha School', attendanceRate: 70 },
          { name: 'Beta School', attendanceRate: 90 },
        ]}
      />,
    );
    expect(container.querySelector('.recharts-wrapper')).not.toBeNull();
  });
  it('renders an empty state with no data', () => {
    const { getByText } = render(<AttendanceComparisonChart data={[]} />);
    expect(getByText('No attendance comparison data')).toBeTruthy();
  });
});

describe('SchoolComparisonChart', () => {
  it('renders with data including a null attendance rate', () => {
    const { container } = render(
      <SchoolComparisonChart
        data={[
          { name: 'Alpha School', enrollment: 100, attendanceRate: 88, teachersCount: 5 },
          { name: 'Beta School', enrollment: 80, attendanceRate: null, teachersCount: 3 },
        ]}
      />,
    );
    expect(container.querySelector('.recharts-wrapper')).not.toBeNull();
    // Series order: enrollment, attendance, teachers. The null row draws no attendance bar.
    const counts = [...container.querySelectorAll('.recharts-bar')].map(
      (bar) => bar.querySelectorAll('.recharts-bar-rectangle').length,
    );
    expect(counts).toEqual([2, 1, 2]);
  });
  it('renders an empty state with no data', () => {
    const { getByText } = render(<SchoolComparisonChart data={[]} />);
    expect(getByText('No comparison data')).toBeTruthy();
  });
});

describe('AttendanceTrendChart', () => {
  it('renders with data including a null rate', () => {
    const { container } = render(
      <AttendanceTrendChart
        data={[
          { period: 'Jan', rate: 90 },
          { period: 'Feb', rate: null },
          { period: 'Mar', rate: 85 },
        ]}
      />,
    );
    expect(container.querySelector('.recharts-wrapper')).not.toBeNull();
    // jsdom has no layout, so the strongest observable proxy: the null month draws
    // no dot (2 of 3) and the curve is two disconnected moves with no joining line.
    expect(container.querySelectorAll('.recharts-line-dot')).toHaveLength(2);
    const d = container.querySelector('.recharts-line-curve')?.getAttribute('d') ?? '';
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).not.toMatch(/[LCQ]/);
  });
  it('renders an empty state with no data', () => {
    const { getByText } = render(<AttendanceTrendChart data={[]} />);
    expect(getByText('No attendance data')).toBeTruthy();
  });
});
