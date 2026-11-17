import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { DeoTransfer, DeoTransfersResult } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DeoTransfersPage from './page';

const TODAY = new Date().toISOString();

function transfer(id: string, studentName: string, overrides: Partial<DeoTransfer> = {}): DeoTransfer {
  return {
    id,
    studentName,
    studentNemisId: '100000000001',
    fromSchool: { id: 'a', name: 'Alpha Academy' },
    toSchool: { id: 'b', name: 'Beta High' },
    direction: 'WITHIN',
    status: 'PENDING',
    lapsed: false,
    initiatedBy: 'ORIGIN_SCHOOL',
    awaitingSchool: { id: 'b', name: 'Beta High' },
    requestedGrade: 'GRADE_4',
    reason: 'Family moved to Buchanan',
    reviewNotes: null,
    createdAt: TODAY,
    requestedDate: null,
    reviewedAt: null,
    ...overrides,
  };
}

const RESULT: DeoTransfersResult = {
  districtId: 'd-1',
  district: { id: 'd-1', name: 'Buchanan' },
  county: { id: 'c-1', name: 'Grand Bassa' },
  transfers: [
    transfer('t-1', 'Musu Kollie'),
    transfer('t-2', 'Sam Doe', {
      direction: 'INTO',
      fromSchool: { id: 'x', name: 'Far School' },
      initiatedBy: 'RECEIVING_SCHOOL',
      lapsed: true,
    }),
    transfer('t-3', 'Ann Toe', {
      direction: 'OUT_OF',
      status: 'APPROVED',
      awaitingSchool: null,
      reviewNotes: 'Records sent',
      reviewedAt: '2026-11-12T00:00:00.000Z',
    }),
  ],
  summary: { pending: 1, lapsed: 1 },
};

function mockNemis(listTransfers: () => Promise<DeoTransfersResult>) {
  (window as unknown as { nemis: unknown }).nemis = { deo: { listTransfers: vi.fn(listTransfers) } };
}

function renderPage() {
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <DeoTransfersPage />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('DEO Transfers page (oversight only)', () => {
  it('shows the banner with pending and lapsed counts and starts on Pending', async () => {
    mockNemis(async () => RESULT);
    renderPage();
    expect(await screen.findByText('Student Transfer Requests')).toBeTruthy();
    expect(screen.getByText('1 pending · 1 lapsed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pending (1)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lapsed (1)' })).toBeTruthy();
    expect(screen.getByText('Musu Kollie')).toBeTruthy();
    expect(screen.queryByText('Sam Doe')).toBeNull();
    expect(screen.getByText('Awaiting Beta High · today')).toBeTruthy();
  });

  it('files a lapsed request under Lapsed with who can act', async () => {
    mockNemis(async () => RESULT);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Lapsed (1)' }));
    expect(screen.getByText('Sam Doe')).toBeTruthy();
    expect(screen.getByText('Lapsed — Beta High can complete or withdraw')).toBeTruthy();
  });

  it('filters by direction', async () => {
    mockNemis(async () => RESULT);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'All (3)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Out of district' }));
    expect(screen.getByText('Ann Toe')).toBeTruthy();
    expect(screen.queryByText('Musu Kollie')).toBeNull();
  });

  it('expands a card into read-only details with no review controls', async () => {
    mockNemis(async () => RESULT);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'All (3)' }));
    fireEvent.click(screen.getByText('Ann Toe'));
    expect(screen.getByText('Records sent')).toBeTruthy();
    expect(screen.getByText('Sending school')).toBeTruthy();
    expect(screen.getByText('Grade 4')).toBeTruthy();
    // The filter pills are "Approved (n)" / "Rejected (n)"; only a decision button would be bare.
    expect(screen.queryByRole('button', { name: /^(approve|reject)$/i })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Schools decide transfers. This page is for district oversight.')).toBeTruthy();
  });

  it('on failure shows only the error, and Retry reloads', async () => {
    let calls = 0;
    mockNemis(async () => {
      calls += 1;
      if (calls === 1) throw new Error('database locked');
      return RESULT;
    });
    renderPage();
    expect(await screen.findByText('Failed to load transfer requests.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Pending/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Musu Kollie')).toBeTruthy();
  });

  it('keeps the banner on screen while loading', () => {
    mockNemis(() => new Promise<DeoTransfersResult>(() => {}));
    renderPage();
    expect(screen.getByText('Student Transfer Requests')).toBeTruthy();
  });

  it('explains when no district is assigned', async () => {
    mockNemis(async () => ({ ...RESULT, districtId: null, transfers: [] }));
    renderPage();
    expect(await screen.findByText('No district assigned to your account.')).toBeTruthy();
  });
});
