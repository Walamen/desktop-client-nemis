import { describe, expect, it } from 'vitest';
import { resolveSchoolDetail } from './school-detail-state';

const school = (id: string) => ({ id });

describe('resolveSchoolDetail', () => {
  it('shows the school once its own load succeeded', () => {
    expect(resolveSchoolDetail('s-b', 's-b', { status: 'success', data: school('s-b') })).toEqual({
      school: school('s-b'),
      isLoading: false,
      isError: false,
    });
  });

  it("treats another school's success as still loading, never as not-found", () => {
    expect(resolveSchoolDetail('s-b', 's-a', { status: 'success', data: school('s-a') })).toEqual({
      school: null,
      isLoading: true,
      isError: false,
    });
  });

  it("treats another school's empty or error result as still loading", () => {
    expect(resolveSchoolDetail('s-b', 's-a', { status: 'empty' })).toMatchObject({ isLoading: true, isError: false });
    expect(
      resolveSchoolDetail('s-b', 's-a', { status: 'error', error: { kind: 'x', userMessage: 'x' } }),
    ).toMatchObject({ isLoading: true, isError: false });
  });

  it('keeps loading while a refresh still holds the previous school', () => {
    expect(resolveSchoolDetail('s-b', 's-b', { status: 'refreshing', data: school('s-a') })).toMatchObject({
      school: null,
      isLoading: true,
      isError: false,
    });
  });

  it("is not-found for this school's own empty or error result, or no id", () => {
    expect(resolveSchoolDetail('s-b', 's-b', { status: 'empty' })).toMatchObject({ isError: true, isLoading: false });
    expect(resolveSchoolDetail('', null, { status: 'idle' })).toMatchObject({ isError: true, isLoading: false });
  });
});
