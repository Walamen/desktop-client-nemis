import { describe, expect, it } from 'vitest';
import { PRODUCTION_CSP } from './csp';

function directives(): Record<string, string[]> {
  return Object.fromEntries(
    PRODUCTION_CSP.split('; ').map((directive) => {
      const [name = '', ...values] = directive.split(' ');
      return [name, values];
    }),
  );
}

describe('PRODUCTION_CSP', () => {
  it('allows Cloudinary images and nothing else remote', () => {
    const csp = directives();
    expect(csp['img-src']).toEqual(["'self'", 'data:', 'https://res.cloudinary.com']);
    for (const [name, values] of Object.entries(csp)) {
      if (name === 'img-src') continue;
      expect(values.some((value) => value.startsWith('http'))).toBe(false);
    }
  });
});
