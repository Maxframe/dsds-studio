# 0008: Group the entry tree by id, and filter it

Status: accepted

## Context

A design system's tokens run to hundreds of entries of one kind, so a flat list per kind stops being
navigable. The schema gives tokens a `metadata.group`, but it is coarse (four values across 170
Oblique semantic tokens) and optional.

## Decision

- **Group by the id.** Entry ids are dotted, or slashed for tokens, and design systems already name
  them in levels. Segments that entries share become a collapsible group (`src/shared/idTree.ts`,
  pure, no names known). It needs nothing beyond what `EntrySummary` carries, and it follows however
  deep the naming goes.
- **Keep the tree quiet.** A chain of levels with a single child folds into one label, a subtree with
  one entry shows that entry (no group of one), and groups keep the order of the document.
- **Groups start closed** and open when an entry inside is selected. Kind groups still start open.
- **Filter, not search.** Every word of the query must appear in an entry's id, name or kind. While a
  filter is set every group is open, so matches are visible; it hides document rows, not documents.
- **Components are shadcn's** (InputGroup, Collapsible); styling is tokens only.

## Consequences

Ids with no structure (`btn1`, `btn2`) stay a flat list. Which groups are open is not remembered yet
(roadmap M3d).
