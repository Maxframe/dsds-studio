import { describe, expect, it } from 'vitest';
import { kindLabels, normalizeCustom, projectNamespace } from './namespaced';

// The pack's `common/id` namespaced pattern: lowercase words, at least one dot.
const PATTERN = '^[a-z0-9]+(-[a-z0-9]+)*(\\.[a-z0-9]+(-[a-z0-9]+)*)+$';

describe('kindLabels', () => {
  it('leaves a well-known value as it is, and shows a custom one without its namespace', () => {
    const labels = kindLabels(['component', 'acme.test', 'acme.my-widget']);
    expect(labels.get('component')).toBe('component');
    expect(labels.get('acme.test')).toBe('Test');
    expect(labels.get('acme.my-widget')).toBe('My widget');
  });

  it('uses the last part of a deeper namespace', () => {
    expect(kindLabels(['acme.ui.chart']).get('acme.ui.chart')).toBe('Chart');
  });

  it('keeps the full value only where two custom kinds would look the same', () => {
    const labels = kindLabels(['acme.test', 'other.test', 'acme.card']);
    expect(labels.get('acme.test')).toBe('acme.test');
    expect(labels.get('other.test')).toBe('other.test');
    expect(labels.get('acme.card')).toBe('Card');
  });
});

describe('normalizeCustom: what a person types becomes a valid namespaced value', () => {
  it('adds the project namespace to a plain name', () => {
    expect(normalizeCustom('Reports', 'acme', PATTERN)).toBe('acme.reports');
    expect(normalizeCustom('  Release notes ', 'acme', PATTERN)).toBe('acme.release-notes');
    expect(normalizeCustom('Q&A / FAQ', 'acme', PATTERN)).toBe('acme.q-a-faq');
  });

  it('keeps a value that already is namespaced and valid', () => {
    expect(normalizeCustom('other.widget', 'acme', PATTERN)).toBe('other.widget');
  });

  it('refuses text with nothing usable in it', () => {
    expect(normalizeCustom('  ', 'acme', PATTERN)).toBeNull();
    expect(normalizeCustom('!!!', 'acme', PATTERN)).toBeNull();
  });

  it('never produces a value the schema would reject', () => {
    expect(normalizeCustom('x', 'Not Valid!', PATTERN)).toBeNull();
  });
});

describe('projectNamespace', () => {
  it('reuses the namespace the project already uses most', () => {
    expect(projectNamespace(['system', 'acme.a', 'acme.b', 'other.c'], 'sys-id', 'demo')).toBe(
      'acme',
    );
  });

  it("otherwise takes the system entry's id: it is in the document and should not change", () => {
    expect(projectNamespace(['system', 'component'], 'acme-design-system', 'demo')).toBe(
      'acme-design-system',
    );
  });

  it('makes an id valid as a namespace, and skips an empty one', () => {
    expect(projectNamespace([], 'Acme Design.System', 'demo')).toBe('acme-design-system');
    expect(projectNamespace([], '', 'My Design System')).toBe('my-design-system');
    expect(projectNamespace([], undefined, 'demo')).toBe('demo');
  });

  it('falls back to a plain word when nothing usable is left', () => {
    expect(projectNamespace([], '!!!', '???')).toBe('custom');
  });
});
