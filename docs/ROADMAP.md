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
- [x] Browser walkthrough: dark and light mode, narrow widths (the YAML panel shrinks so the form keeps
      a usable width), scroll-to-finding from the panel
- [x] Form edits save in style-guide field order (pack's `dsds-format`, run on `file/ops`)
- [x] Lint (advisory) findings panel: the pack's `lint-docs.js` runs per project; results show as
      "Advice" under validation (ADR 0004)

## M3: Versioning

Model (ADR 0005): the draft is the uncommitted changes in the project files; saving a version
commits them with the local git CLI.

- [x] Draft state: dirty/clean indicator and "N files changed" since the last version; Discard changes
      (a new project gets an "Initial version" commit; discarded changes go to a git stash)
- [x] Quicksave (button or Ctrl/Cmd+S, auto label with timestamp) and named version (label, optional
      tag, suggested from `metadata.version`), both commits in one history; the kind is a commit
      trailer (`DSDS-Kind`)
- [x] History list from `git log`, quicksaves folded away by default, name or tag one later (a later
      name is a git note, so history is never rewritten)
- [x] Entry-level structural diff between revisions (match by `uuid`, else `id`; warn on an id that
      disappeared or changed, per Specification §3.1): "Review changes" for the draft, "Compare" for
      any version in the history
- [x] Restore revision as a new commit; with unsaved changes, ask first: quicksave, discard or cancel
      (`DSDS-Restored-From` trailer records the source)
- [x] Stamp `metadata.updated` (today, label as note) on changed entries when saving a named version
      (checkbox in the Save version popover, on by default; never for quicksaves)

## M3.5: Decision records

Authoring convention on top of DSDS, no schema change: a decision is a generic `kind: entry` tagged
`decision`, so it keeps full validation (a custom kind would be unchecked). Sections: Context,
Decision, Consequences, Alternatives considered. Status lives in `metadata.status`: proposed,
accepted, deprecated; superseded = `deprecated` + `replacedBy`. Depends on M3 (history, "left as
written").

- [x] "Add decision" template: numbered id (`adr-0012-slug`), the four sections (one headed section),
      status `proposed`, tagged `decision`, dated; offered on request in the New entry panel.
      Optional `metadata.preview` is added from the form like any field
- [ ] Status shown as proposed / accepted / deprecated / superseded, with a Supersede action that
      creates the linked new record and marks the old one (`deprecated` + `replacedBy`)
- [ ] Decisions view in the sidebar, newest first, filter by status
- [ ] Confirm before editing an accepted record, pointing at Supersede
- [ ] "Decisions affecting this entry" panel from the resolver's backlinks

## M4: Import / export / migration

- [ ] Import file / paste / folder / zip
- [ ] Export bundled, split (zip), YAML/JSON, formatted, validation report, rendered view
- [ ] Schema upgrade flow using pack migration scripts

## M5: Future-proofing proof

- [ ] Synthetic "future" pack with a new field and kind: app handles it with zero code change
