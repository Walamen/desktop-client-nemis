import { describe, expect, it } from 'vitest';
import { countError, emailError, establishedYearError, principalNameError } from './server-rules';

describe('server-equivalent registration checks', () => {
  it('emailError: required, then the server @IsEmail rule', () => {
    expect(emailError('  ')).toBe('Required');
    expect(emailError('jane@school')).toBe('Invalid email');
    expect(emailError('jane school@x.lr')).toBe('Invalid email');
    expect(emailError(' jane@school.lr ')).toBeNull();
  });

  it('principalNameError: both name parts the server builds must have 2+ characters', () => {
    expect(principalNameError('A')).toBe('First and last name must each be at least 2 characters');
    expect(principalNameError('Ada B')).toBe('First and last name must each be at least 2 characters');
    expect(principalNameError('Ada')).toBeNull();
    expect(principalNameError('Ada Mary Doe')).toBeNull();
  });

  it('establishedYearError: 1800 or later when given', () => {
    expect(establishedYearError('1799')).toBe('Must be 1800 or later');
    expect(establishedYearError('1800')).toBeNull();
    expect(establishedYearError('')).toBeNull();
  });

  it('countError: never negative when given', () => {
    expect(countError('-1')).toBe('Cannot be negative');
    expect(countError('0')).toBeNull();
    expect(countError('')).toBeNull();
  });
});
