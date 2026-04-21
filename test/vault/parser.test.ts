import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseVault, parseFileFromContent } from '../../src/vault/parser.js';

const FIXTURE_VAULT = join(import.meta.dirname, '..', 'fixtures', 'vault');

describe('parseVault', () => {
  it('finds all .md files and skips excluded directories', async () => {
    const { nodes } = await parseVault(FIXTURE_VAULT);
    const ids = nodes.map((n) => n.id);
    expect(ids).toContain('People/Alice Smith.md');
    expect(ids).toContain('People/Bob Jones.md');
    expect(ids).toContain('Concepts/Widget Theory.md');
    expect(ids).toContain('orphan.md');
    // Should NOT include .obsidian or attachments
    expect(ids.every((id) => !id.startsWith('.obsidian/'))).toBe(true);
    expect(ids.every((id) => !id.startsWith('attachments/'))).toBe(true);
  });

  it('parses frontmatter correctly', async () => {
    const { nodes } = await parseVault(FIXTURE_VAULT);
    const alice = nodes.find((n) => n.id === 'People/Alice Smith.md')!;
    expect(alice.title).toBe('Alice Smith');
    expect(alice.frontmatter.type).toBe('person');
    expect(alice.frontmatter.aliases).toContain('A. Smith');
  });

  it('falls back to filename when no title in frontmatter', async () => {
    const { nodes } = await parseVault(FIXTURE_VAULT);
    const noTitle = nodes.find((n) => n.id === 'no-title.md')!;
    expect(noTitle.title).toBe('no-title');
  });

  it('extracts resolved edges with context', async () => {
    const { edges } = await parseVault(FIXTURE_VAULT);
    const aliceToWidget = edges.find(
      (e) =>
        e.sourceId === 'People/Alice Smith.md' &&
        e.targetId === 'Concepts/Widget Theory.md',
    );
    expect(aliceToWidget).toBeDefined();
    expect(aliceToWidget!.context).toContain('Widget Theory');
  });

  it('creates stub edges for nonexistent targets', async () => {
    const { edges, stubIds } = await parseVault(FIXTURE_VAULT);
    const stubEdge = edges.find((e) => e.targetId.includes('Nonexistent Page'));
    expect(stubEdge).toBeDefined();
    expect(stubIds.size).toBeGreaterThan(0);
  });

  it('extracts inline tags', async () => {
    const { nodes } = await parseVault(FIXTURE_VAULT);
    const bob = nodes.find((n) => n.id === 'People/Bob Jones.md')!;
    expect(bob.frontmatter.inline_tags).toContain('research');
    expect(bob.frontmatter.inline_tags).toContain('published');
  });
});

describe('parseFileFromContent inline Dataview fields', () => {
  const empty = {
    stemLookup: new Map<string, string[]>(),
    paths: new Set<string>(),
  };

  it('parses `key:: value` lines into frontmatter', () => {
    const raw = [
      '---',
      'title: Example',
      '---',
      '',
      'status:: reading',
      'priority:: high',
      '',
      'Some body text.',
    ].join('\n');
    const { node } = parseFileFromContent(
      'Example.md',
      raw,
      empty.stemLookup,
      empty.paths,
    );
    expect(node.frontmatter.status).toBe('reading');
    expect(node.frontmatter.priority).toBe('high');
  });

  it('ignores `::` inside fenced code blocks', () => {
    const raw = [
      '# Title',
      '',
      '```ts',
      'const x:: number = 1;',
      '```',
      '',
      'real:: field',
    ].join('\n');
    const { node } = parseFileFromContent(
      'Example.md',
      raw,
      empty.stemLookup,
      empty.paths,
    );
    expect(node.frontmatter.real).toBe('field');
    expect(node.frontmatter.x).toBeUndefined();
  });

  it('does not override explicit YAML frontmatter', () => {
    const raw = [
      '---',
      'status: done',
      '---',
      '',
      'status:: reading',
    ].join('\n');
    const { node } = parseFileFromContent(
      'Example.md',
      raw,
      empty.stemLookup,
      empty.paths,
    );
    // YAML frontmatter wins — matter() is merged first, inline fields spread after,
    // but duplicate inline writes skip existing keys so YAML `status` survives.
    expect(node.frontmatter.status).toBe('done');
  });
});
