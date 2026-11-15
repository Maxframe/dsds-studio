/**
 * Decisions (ADRs) as DSDS content, an authoring convention and not a schema feature
 * (ADR 0005, roadmap M3.5): a generic `kind: entry` tagged `decision`, so it keeps full validation
 * (a custom kind would be unchecked). Status lives in `metadata.status`; a superseded record is
 * `deprecated` with `replacedBy`, which is how the spec says "this was replaced by that".
 */
export const DECISION_TAG = 'decision';

/** The headings of a record, in reading order. */
export const DECISION_HEADINGS = ['Context', 'Decision', 'Consequences', 'Alternatives considered'];

const MAX_ID = 64;

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** `adr-0012-title-words`: the next free number (after the highest in use), then the title. */
export function nextDecisionId(existingIds: readonly string[], title: string): string {
  let highest = 0;
  for (const id of existingIds) {
    const n = /^adr-(\d+)-/.exec(id)?.[1];
    if (n) highest = Math.max(highest, Number(n));
  }
  const prefix = `adr-${String(highest + 1).padStart(4, '0')}-`;
  const slug = slugify(title)
    .slice(0, MAX_ID - prefix.length)
    .replace(/-+$/, '');
  return `${prefix}${slug || 'decision'}`;
}

export interface DecisionTemplate {
  kind: 'entry';
  id: string;
  name: string;
  description: string;
  metadata: {
    status: { status: 'proposed' };
    tags: string[];
    updated: { date: string };
  };
  sections: Array<{
    kind: 'section';
    for: 'all';
    freeform: Array<{ title: string; body: string }>;
  }>;
}

/** A new, proposed record. `date` is `YYYY-MM-DD` (`metadata.updated.date` doubles as its date). */
export function decisionTemplate(id: string, title: string, date: string): DecisionTemplate {
  return {
    kind: 'entry',
    id,
    name: title,
    description: title,
    metadata: {
      status: { status: 'proposed' },
      tags: [DECISION_TAG],
      updated: { date },
    },
    sections: [
      {
        kind: 'section',
        for: 'all',
        freeform: DECISION_HEADINGS.map((heading) => ({ title: heading, body: '' })),
      },
    ],
  };
}

/** A date as the spec writes it in `metadata`: `YYYY-MM-DD`, in local time. */
export function isoDate(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
