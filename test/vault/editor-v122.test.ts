import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { editNote, type EditMode } from '../../src/vault/editor.js';

let vault: string;
const rel = 'note.md';

async function seed(initial: string): Promise<void> {
  vault = await mkdtemp(join(tmpdir(), 'kg-editor-v122-'));
  await writeFile(join(vault, rel), initial, 'utf-8');
}

const edit = (mode: EditMode) => editNote(vault, rel, mode);
const read = () => readFile(join(vault, rel), 'utf-8');

afterEach(async () => {
  if (vault) await rm(vault, { recursive: true, force: true });
});

describe('editor - append leading newline defence (F8)', () => {
  it('inserts a leading newline when source does not end in newline', async () => {
    await seed('trailing text no newline');
    await edit({ kind: 'append', content: 'added\n' });
    expect(await read()).toBe('trailing text no newline\nadded\n');
  });

  it('does not double newlines when source already ends with one', async () => {
    await seed('line1\nline2\n');
    await edit({ kind: 'append', content: 'added\n' });
    expect(await read()).toBe('line1\nline2\nadded\n');
  });

  it('appends to empty file without inserting a leading newline', async () => {
    await seed('');
    await edit({ kind: 'append', content: 'first\n' });
    expect(await read()).toBe('first\n');
  });
});

describe('editor - patch_heading scope + blank-line preservation (F4/F5)', () => {
  const trailerFixture =
    '## Section A\nbody A\n\n## Section B\nbody B\n\nAppended trailer line.\n';

  it('default section scope eats to EOF on the last heading (historical behaviour)', async () => {
    await seed(trailerFixture);
    await edit({
      kind: 'patch_heading',
      heading: 'Section B',
      content: 'new-B',
      op: 'replace',
    });
    const after = await read();
    expect(after).toContain('new-B');
    expect(after).not.toContain('Appended trailer line.');
  });

  it("scope: 'body' stops at the first blank-line boundary (trailer survives)", async () => {
    await seed(trailerFixture);
    await edit({
      kind: 'patch_heading',
      heading: 'Section B',
      content: 'new-B',
      op: 'replace',
      scope: 'body',
    });
    const after = await read();
    expect(after).toContain('new-B');
    expect(after).toContain('Appended trailer line.');
    expect(after).not.toContain('body B');
  });

  it("scope: 'body' stops at the next same-level heading when no blank boundary first", async () => {
    await seed('## A\nline1\nline2\n## B\nbody B\n');
    await edit({
      kind: 'patch_heading',
      heading: 'A',
      content: 'NEW',
      op: 'replace',
      scope: 'body',
    });
    const after = await read();
    expect(after).toContain('## B');
    expect(after).toContain('NEW');
    expect(after).not.toContain('line1');
  });

  it('preserves the blank line between heading and replacement body', async () => {
    // Same-level headings so 'H''s section stops at '## Next' (not nested).
    await seed('## H\n\nold body\n\n## Next\n');
    await edit({
      kind: 'patch_heading',
      heading: 'H',
      content: 'new body',
      op: 'replace',
    });
    expect(await read()).toBe('## H\n\nnew body\n## Next\n');
  });
});

// v1.4.0 A4: `removedLen` on the EditResult + body-scope double-blank fix.
describe('editor - patch_heading removedLen + body-scope (v1.4.0 A4)', () => {
  it('section-scope on the LAST heading reports non-zero removedLen so callers can detect greedy EOF consumption', async () => {
    // Feedback's "trailing heading eats to EOF" scenario: the default scope
    // consumes the trailing paragraph silently. `removedLen` lets callers
    // notice.
    await seed(
      '## Only Heading\nfirst body line\n\nAppended trailer line.\n',
    );
    const result = await edit({
      kind: 'patch_heading',
      heading: 'Only Heading',
      content: 'replacement',
      op: 'replace',
      // default scope: 'section'
    });
    expect(result.removedLen).toBeGreaterThan(0);
    const after = await read();
    // Confirm the greedy consumption — the trailer IS gone.
    expect(after).not.toContain('Appended trailer line.');
    expect(after).toContain('replacement');
  });

  it("body-scope replace does NOT produce a double blank line before the next block", async () => {
    // Reproduces the v1.4.0 feedback cosmetic: body-scope replace emitted
    // two blank lines where one was correct. The fix eats the trailing
    // boundary blank during splice so the content's own `\n` suffix provides
    // the separator.
    await seed('## A\n\nold body\n\n## Next\n');
    await edit({
      kind: 'patch_heading',
      heading: 'A',
      content: 'new body\n',
      op: 'replace',
      scope: 'body',
    });
    const after = await read();
    // No triple-newline anywhere, which is the observable form of "double
    // blank line in rendered Obsidian".
    expect(after).not.toMatch(/\n\n\n/);
    expect(after).toContain('new body');
    expect(after).toContain('## Next');
  });

  it('body-scope replace reports a non-zero removedLen for the consumed body', async () => {
    await seed('## A\n\nbody to remove\n\n## Next\n');
    const result = await edit({
      kind: 'patch_heading',
      heading: 'A',
      content: 'replacement',
      op: 'replace',
      scope: 'body',
    });
    expect(result.removedLen).toBeGreaterThan(0);
  });

  it('op: "before" / "after" report removedLen: 0 (insert-only paths)', async () => {
    await seed('## A\nbody\n');
    const before = await edit({
      kind: 'patch_heading',
      heading: 'A',
      content: 'INS',
      op: 'before',
    });
    expect(before.removedLen).toBe(0);
    // Reset for the second case.
    await seed('## A\nbody\n');
    const after = await edit({
      kind: 'patch_heading',
      heading: 'A',
      content: 'INS',
      op: 'after',
    });
    expect(after.removedLen).toBe(0);
  });
});
