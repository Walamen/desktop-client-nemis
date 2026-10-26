import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const renderer = join(__dirname, '..', '..');

describe('retired promotion page', () => {
  it('promote route and outcomes components are gone; the close route exists', () => {
    expect(existsSync(join(renderer, 'app/government/school-admin/students/promote'))).toBe(false);
    expect(existsSync(join(renderer, 'components/outcomes'))).toBe(false);
    expect(existsSync(join(renderer, 'app/government/school-admin/academic-years/close/page.tsx'))).toBe(true);
  });
});
