import { describe, expect, it } from 'vitest';
import { PersonName } from './person-name';
import { EmailAddress } from './email-address';
import { PhoneNumber } from './phone-number';
import { NationalId } from './national-id';
import { InvalidValueObjectException } from '../exceptions';

describe('PersonName', () => {
  it('builds full name and trims parts', () => {
    const name = PersonName.create({ firstName: ' Ama ', lastName: 'Kollie' });
    expect(name.firstName).toBe('Ama');
    expect(name.full).toBe('Ama Kollie');
    const withMiddle = PersonName.create({ firstName: 'Ama', middleName: 'B', lastName: 'Kollie' });
    expect(withMiddle.full).toBe('Ama B Kollie');
  });

  it('rejects empty first or last name', () => {
    expect(() => PersonName.create({ firstName: '', lastName: 'K' })).toThrow(
      InvalidValueObjectException,
    );
  });
});

describe('EmailAddress', () => {
  it('lowercases and validates', () => {
    expect(EmailAddress.create('Admin@School.LR').value).toBe('admin@school.lr');
    expect(() => EmailAddress.create('nope')).toThrow(InvalidValueObjectException);
  });
});

describe('PhoneNumber', () => {
  it('accepts digits with optional +, rejects letters', () => {
    expect(PhoneNumber.create('+231770000000').value).toBe('+231770000000');
    expect(() => PhoneNumber.create('call-me')).toThrow(InvalidValueObjectException);
  });
});

describe('NationalId', () => {
  it('trims and rejects empty', () => {
    expect(NationalId.create(' LR-123 ').value).toBe('LR-123');
    expect(() => NationalId.create('  ')).toThrow(InvalidValueObjectException);
  });
});
