import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AddSchoolPage from './schools/create/page';
import GenerateReportPage from './reports/generate/page';

describe('County quick-action placeholder routes', () => {
  it('Add New School is a ComingSoon page', () => {
    render(<AddSchoolPage />);
    expect(screen.getByText('Add New School')).toBeInTheDocument();
    expect(screen.getByText(/has not been migrated to the desktop client yet/)).toBeInTheDocument();
  });

  it('Generate Report is a ComingSoon page', () => {
    render(<GenerateReportPage />);
    expect(screen.getByText('Generate Report')).toBeInTheDocument();
  });
});
