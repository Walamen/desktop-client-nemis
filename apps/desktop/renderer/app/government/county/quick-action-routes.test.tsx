import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import GenerateReportPage from './reports/generate/page';

// Add New School (schools/create) is a real page now: see
// components/county/schools/CreateSchoolPage.test.tsx.
describe('County quick-action placeholder routes', () => {
  it('Generate Report is a ComingSoon page', () => {
    render(<GenerateReportPage />);
    expect(screen.getByText('Generate Report')).toBeInTheDocument();
  });
});
