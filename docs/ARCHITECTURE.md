# Architecture

## Goal

A local app to author DSDS documents that keeps working when the upstream schema changes, with
import, export and revision history.

## Layers

```
src/web     React UI (Vite). Talks to the server over /api. Styled only by design tokens.
src/server  Hono API. Owns filesystem, git, schema packs, validation, import/export.
src/shared  Pure types and helpers used by both.
packs/      Immutable vendored upstream releases, one folder per DSDS version.
workspace/  User projects. Each is a folder of .dsds.yaml files and its own git repo.
```

## Schema packs

`packs/<version>/` mirrors upstream's layout (`schema/`, `scripts/`, `examples/`) plus `pack.json`.
Upstream's semantic rules (DSDS-01..25) exist only in its `scripts/validate/validate.js`, so the
server runs each pack's own validator (through a thin adapter in `src/server/validator/`) instead of
reimplementing rules. A pack is trusted only after its conformance suite
(`scripts/validate/conformance-test.js`) passes. A document is bound to the pack matching its
`schemaVersion`.

Adding support for a new spec release = `npm run pack:add -- vX.Y.Z`. No app code change should be
required. If it is, that is a bug in the schema-driven design: fix the design, not the symptom.

## Schema-driven editor

Forms are generated from the pack's bundled JSON Schema (labels from `description`, help from
`$comment`, options from `enum`, hints from `example`). The renderer understands upstream's `kind`
dispatch (`if/then/else`), the `ref`, `id` and `$extensions` shapes. Any subtree it cannot render
falls back to a raw YAML editor.

## Documents and round-trip

Documents are parsed to `yaml` Document ASTs and edited in place so comments, order and unknown
fields survive. Consumers MUST preserve `$extensions` they do not understand (upstream spec §9).

## Versioning

Two independent things:

- **Schema version:** the pack a document targets. Upgrading runs the pack's migration scripts
  (additive releases just bump `schemaVersion`) and is saved as a normal revision.
- **Document revisions:** git, one repo per project in `workspace/`. Labelled commits, tags,
  entry-level structural diff, restore.

## Import / export

Import: single file (YAML/JSON), pasted text, folder or zip following `rel: file` refs inside the
folder only (upstream security rule). Export: bundled document, split project (zip), YAML or JSON,
formatted with the pack's formatter, plus validation report JSON and a rendered view that hides
`for: agent` sections.

## Design tokens

Two tiers in `src/web/styles/tokens.css`: primitives (`--p-*`) and semantic (`--color-*`,
`--space-*` ...). Components use semantic tokens only; dark mode redefines semantic tokens.
