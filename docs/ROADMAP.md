# Roadmap

Work top to bottom. Each item has an acceptance check; tick it only when `npm run check` passes.

## M0: Scaffold

- [x] Tooling: TypeScript, Vite, React, Hono, vitest, eslint, prettier
- [x] Design tokens + `check:tokens` guardrail
- [x] `pack:add` script, `/api/packs`
- [x] Vendor pack 0.23.1; pack test runs its validator and conformance suite green

## M1: Core

- [x] Validator adapter: validate a YAML/JSON string against a pack, return findings
      `{rule, severity, pointer, message, fix}`
- [x] Document model: parse to yaml AST, serialize; round-trip test over every `packs/*/examples`
      file (byte-stable or semantically equal)
- [x] Project model: folder of documents, follow `rel: file`, entry/shared index, resolver (backlinks)

## M2: Editor

- [x] Project list, create/open project (git init), file tree grouped by entry kind
- [x] Schema-driven form renderer with raw-YAML fallback per subtree
- [x] Entry editor: envelope, sections (add/reorder/audience), kind-specific fields, metadata
- [x] Ref picker with `entry#address` autocomplete
- [x] `dsds:` inline-link autocomplete in Markdown fields (form + YAML panel)
- [x] Validation panel, click to jump to field
- [x] Live YAML panel with two-way sync and cross-view field highlighting; remove entries
- [ ] Browser walkthrough, remaining: dark mode, narrow widths, scroll-to-finding from the panel
- [x] Form edits save in style-guide field order (pack's `dsds-format`, run on `file/ops`)
- [ ] Lint (advisory) findings panel: needs the pack's `lint-docs.js` in the adapter

## M3: Versioning

- [ ] Save as labelled commit, history list, tags
- [ ] Entry-level structural diff between revisions
- [ ] Restore revision

## M4: Import / export / migration

- [ ] Import file / paste / folder / zip
- [ ] Export bundled, split (zip), YAML/JSON, formatted, validation report, rendered view
- [ ] Schema upgrade flow using pack migration scripts

## M5: Future-proofing proof

- [ ] Synthetic "future" pack with a new field and kind: app handles it with zero code change
