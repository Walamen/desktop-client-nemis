import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// Drives the repo's real flat config through ESLint's API against in-memory
// probe files, so the domain import guard (packages/domain/eslint.config.mjs)
// is tested rather than trusted.
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const domainProbe = path.join(repoRoot, 'packages/domain/src/__guard_probe__.ts');

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: repoRoot });
});

async function ruleHits(source: string, filePath: string, ruleId: string): Promise<number> {
  expect(await eslint.isPathIgnored(filePath)).toBe(false);
  const [result] = await eslint.lintText(source, { filePath });
  expect(result?.fatalErrorCount ?? 0).toBe(0);
  return (result?.messages ?? []).filter((m) => m.ruleId === ruleId).length;
}

const restricted = (source: string) => ruleHits(source, domainProbe, 'no-restricted-imports');

describe('domain import guard', () => {
  it('allows the pure NEMIS ID subpath', async () => {
    expect(await restricted("import { normalizeNemisId } from '@nemis-desktop/shared/nemis-id';\nexport { normalizeNemisId };\n")).toBe(0);
  });

  it('does not catch unrelated packages that share the prefix', async () => {
    expect(await restricted("import { x } from '@nemis-desktop/shared-extra';\nexport { x };\n")).toBe(0);
  });

  it.each([
    ["the shared package root", "import { IPCError } from '@nemis-desktop/shared';\nexport { IPCError };\n"],
    ['another shared subpath', "import { x } from '@nemis-desktop/shared/errors';\nexport { x };\n"],
    ['a look-alike of the allowed subpath', "import { x } from '@nemis-desktop/shared/src/nemis-id';\nexport { x };\n"],
    ['a path under the allowed subpath', "import { x } from '@nemis-desktop/shared/nemis-id/extra';\nexport { x };\n"],
    ['the shared package root with a trailing slash', "import { IPCError } from '@nemis-desktop/shared/';\nexport { IPCError };\n"],
    ['the shared package root in another case', "import { IPCError } from '@nemis-desktop/Shared';\nexport { IPCError };\n"],
    ['the allowed subpath with a trailing slash', "import { x } from '@nemis-desktop/shared/nemis-id/';\nexport { x };\n"],
    ['the shared index module', "import { x } from '@nemis-desktop/shared/index';\nexport { x };\n"],
    ['electron', "import { app } from 'electron';\nexport { app };\n"],
    ['a database path', "import { x } from '../../database/connection';\nexport { x };\n"],
  ])('still bans %s', async (_label, source) => {
    expect(await restricted(source)).toBeGreaterThan(0);
  });
}, 60_000);

describe('scripts Node globals', () => {
  it('apply to files under scripts/', async () => {
    const hits = await ruleHits("console.log(process.argv);\n", path.join(repoRoot, 'scripts/__probe__.mjs'), 'no-undef');
    expect(hits).toBe(0);
  });

  it('do not leak to .mjs files outside scripts/', async () => {
    const hits = await ruleHits("console.log(process.argv);\n", path.join(repoRoot, 'packages/domain/__probe__.mjs'), 'no-undef');
    expect(hits).toBeGreaterThan(0);
  });
}, 60_000);
