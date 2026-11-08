# Format edited documents with the pack's own formatter

## Context

The DSDS style guide asks for fields in the order the schema files declare. `yaml`'s `setIn`
appends new keys at the end of a map, so a form edit could put `description` after `$extensions`.

## Decision

After applying edit ops, `/file/ops` runs the active pack's `formatText` (`scripts/format/format.js`)
on the YAML text. It reads the order from the pack's schema, moves lines only, and keeps comments and
unknown fields, so no field order is hardcoded in app code and the round-trip rule holds.

Not applied: the raw YAML editor (`PUT /file`), so text is never reordered under the cursor, and JSON
documents. Reading-order rules (entry kind order, sections, guideline items) stay advisory; the
formatter does not touch them.

## Consequences

A new pack ships its own formatter, so new field orders need no app change. Remaining gap: the
`yaml` serializer still re-flows some scalars and pads flow collections when a document is modified.
