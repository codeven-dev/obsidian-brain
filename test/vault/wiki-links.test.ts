import { describe, it, expect } from 'vitest';
import {
  extractWikiLinks,
  buildStemLookup,
  resolveLink,
  rewriteWikiLinks,
} from '../../src/vault/wiki-links.js';

describe('extractWikiLinks', () => {
  it('extracts bare wiki links', () => {
    const links = extractWikiLinks('See [[Alice Smith]] for details.');
    expect(links).toEqual([{ raw: 'Alice Smith', display: null }]);
  });

  it('extracts path-qualified links', () => {
    const links = extractWikiLinks('Uses [[Concepts/Widget Theory]] extensively.');
    expect(links).toEqual([{ raw: 'Concepts/Widget Theory', display: null }]);
  });

  it('extracts pipe-aliased links', () => {
    const links = extractWikiLinks(
      'The [[Concepts/Widget Theory|widget framework]] works.',
    );
    expect(links).toEqual([
      { raw: 'Concepts/Widget Theory', display: 'widget framework' },
    ]);
  });

  it('ignores links inside code blocks', () => {
    const md = '```\n[[not a link]]\n```\nBut [[real link]] is.';
    const links = extractWikiLinks(md);
    expect(links).toEqual([{ raw: 'real link', display: null }]);
  });

  it('ignores embedded image links', () => {
    const links = extractWikiLinks('Look at ![[photo.png]] and [[real link]].');
    expect(links).toEqual([{ raw: 'real link', display: null }]);
  });

  it('extracts multiple links from one paragraph', () => {
    const links = extractWikiLinks(
      'Both [[Alice]] and [[Bob]] agreed on [[Plan]].',
    );
    expect(links).toHaveLength(3);
  });
});

describe('buildStemLookup', () => {
  it('maps filename stems to full paths', () => {
    const paths = ['People/Alice Smith.md', 'Concepts/Widget Theory.md'];
    const lookup = buildStemLookup(paths);
    expect(lookup.get('Alice Smith')).toEqual(['People/Alice Smith.md']);
    expect(lookup.get('Widget Theory')).toEqual(['Concepts/Widget Theory.md']);
  });

  it('detects ambiguous stems', () => {
    const paths = ['People/Alice Smith.md', 'Archive/Alice Smith.md'];
    const lookup = buildStemLookup(paths);
    expect(lookup.get('Alice Smith')).toHaveLength(2);
  });
});

describe('resolveLink', () => {
  const allPaths = [
    'People/Alice Smith.md',
    'People/Bob Jones.md',
    'Concepts/Widget Theory.md',
  ];
  const lookup = buildStemLookup(allPaths);

  it('resolves bare name to unique path', () => {
    expect(resolveLink('Alice Smith', lookup)).toBe('People/Alice Smith.md');
  });

  it('resolves path-qualified link directly', () => {
    expect(resolveLink('People/Bob Jones', lookup)).toBe('People/Bob Jones.md');
  });

  it('returns null for unresolvable links (stub nodes)', () => {
    expect(resolveLink('Nonexistent Page', lookup)).toBeNull();
  });
});

describe('rewriteWikiLinks', () => {
  it('rewrites a bare [[old]] link', () => {
    const { text, occurrences } = rewriteWikiLinks(
      'See [[old]] for details.',
      'old',
      'new',
    );
    expect(text).toBe('See [[new]] for details.');
    expect(occurrences).toBe(1);
  });

  it('preserves the display alias in [[old|display]]', () => {
    const { text, occurrences } = rewriteWikiLinks(
      'The [[old|widget framework]] works.',
      'old',
      'new',
    );
    expect(text).toBe('The [[new|widget framework]] works.');
    expect(occurrences).toBe(1);
  });

  it('preserves the ! prefix for embeds ![[old]]', () => {
    const { text, occurrences } = rewriteWikiLinks(
      'Embed: ![[old]] end.',
      'old',
      'new',
    );
    expect(text).toBe('Embed: ![[new]] end.');
    expect(occurrences).toBe(1);
  });

  it('preserves a #heading suffix', () => {
    const { text, occurrences } = rewriteWikiLinks(
      'Jump to [[old#Intro]].',
      'old',
      'new',
    );
    expect(text).toBe('Jump to [[new#Intro]].');
    expect(occurrences).toBe(1);
  });

  it('preserves a ^block suffix', () => {
    const { text, occurrences } = rewriteWikiLinks(
      'Block ref [[old^abc123]] here.',
      'old',
      'new',
    );
    expect(text).toBe('Block ref [[new^abc123]] here.');
    expect(occurrences).toBe(1);
  });

  it('leaves non-matching links untouched', () => {
    const { text, occurrences } = rewriteWikiLinks(
      'Mentions [[other]] and [[another]].',
      'old',
      'new',
    );
    expect(text).toBe('Mentions [[other]] and [[another]].');
    expect(occurrences).toBe(0);
  });

  it('counts every occurrence in mixed content', () => {
    const input =
      'First [[old]], then ![[old]], and [[old|alias]] plus [[other]].';
    const { text, occurrences } = rewriteWikiLinks(input, 'old', 'new');
    expect(text).toBe(
      'First [[new]], then ![[new]], and [[new|alias]] plus [[other]].',
    );
    expect(occurrences).toBe(3);
  });

  it('handles empty input', () => {
    expect(rewriteWikiLinks('', 'old', 'new')).toEqual({
      text: '',
      occurrences: 0,
    });
  });

  it('does not rewrite a link whose stem only contains oldStem as a substring', () => {
    const { text, occurrences } = rewriteWikiLinks(
      'Mention [[old-notes]] here.',
      'old',
      'new',
    );
    expect(text).toBe('Mention [[old-notes]] here.');
    expect(occurrences).toBe(0);
  });

  it('trims whitespace around the stem when matching', () => {
    const { text, occurrences } = rewriteWikiLinks(
      'Padded [[ old ]] link.',
      'old',
      'new',
    );
    expect(text).toBe('Padded [[new]] link.');
    expect(occurrences).toBe(1);
  });
});
