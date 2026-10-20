import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import ReportsPage from './page';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

describe('County reports route', () => {
  it('the old reports route redirects to generate', () => {
    render(<ReportsPage />);
    expect(replace).toHaveBeenCalledWith('/government/county/reports/generate');
  });
});
