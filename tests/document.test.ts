import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DsdsDocument, formatFromFilename } from '@server/documents/document';
import { exampleFiles } from './helpers';

// DSDS tooling must keep what it does not understand ($extensions, comments, order).
const files = exampleFiles(/\.(ya?ml|dsds\.json)$/);
const comments = (text: string) => text.split('\n').filter((l) => /^\s*#/.test(l));

describe('lossless document model', () => {
  it('found example files to test', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  describe.each(files.map((f) => [f.split('/examples/')[1] as string, f]))('%s', (_name, file) => {
    const text = readFileSync(file, 'utf8');
    const doc = DsdsDocument.parse(text, formatFromFilename(file));

    it('parses without errors', () => {
      expect(doc.parseErrors).toEqual([]);
    });

    it('returns unmodified text byte for byte', () => {
      expect(doc.toText()).toBe(text);
    });

    it('re-rendering through the AST keeps the same data and comments', () => {
      const again = DsdsDocument.parse(doc.render(), doc.format);
      expect(again.toValue()).toEqual(doc.toValue());
      if (doc.format === 'yaml') expect(comments(doc.render())).toEqual(comments(text));
    });
  });

  describe('editing', () => {
    const src = `# header comment
schemaVersion: "0.23.1"
name: Acme # trailing comment
entries:
  - kind: entry
    id: intro
    name: Intro
    description: Hello.
    $extensions:
      com.acme:
        keep: me
`;
    it('keeps comments and $extensions when a value changes', () => {
      const doc = DsdsDocument.parse(src);
      doc.setAt('/entries/0/name', 'Introduction');
      const out = doc.toText();
      expect(out).toContain('# header comment');
      expect(out).toContain('# trailing comment');
      expect(out).toContain('keep: me');
      expect((doc.toValue() as { entries: Array<{ name: string }> }).entries[0]?.name).toBe(
        'Introduction',
      );
    });

    it('adds, appends and removes by JSON Pointer', () => {
      const doc = DsdsDocument.parse(src);
      doc.appendAt('/entries', { kind: 'entry', id: 'two', name: 'Two', description: 'x' });
      doc.setAt('/entries/0/metadata', { tags: ['a'] });
      expect(doc.hasAt('/entries/1/id')).toBe(true);
      expect(doc.removeAt('/entries/0/description')).toBe(true);
      expect(doc.hasAt('/entries/0/description')).toBe(false);
      expect(doc.isModified).toBe(true);
    });

    it('moves a list item with its comments', () => {
      const doc = DsdsDocument.parse('items:\n  - a # first\n  - b # second\n  - c\n');
      doc.moveAt('/items', 0, 2);
      expect(doc.toText()).toBe('items:\n  - b # second\n  - c\n  - a # first\n');
      expect(() => doc.moveAt('/items', 0, 9)).toThrow();
    });

    it('reports parse errors instead of throwing', () => {
      expect(DsdsDocument.parse('a: [unclosed').parseErrors.length).toBeGreaterThan(0);
    });

    it('writes JSON documents back as JSON', () => {
      const doc = DsdsDocument.parse('{"schemaVersion":"0.23.1","name":"x","entries":[]}');
      doc.setAt('/name', 'y');
      expect(JSON.parse(doc.toText()).name).toBe('y');
    });
  });
});
