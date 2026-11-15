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

## M3.5: Decisions

Authoring convention on top of DSDS, no schema change: a decision is a generic `kind: entry` tagged
`decision`, so it keeps full validation (a custom kind would be unchecked). Sections: Context,
Decision, Consequences, Alternatives considered. Status lives in `metadata.status`: proposed,
accepted, deprecated; superseded = `deprecated` + `replacedBy`. Depends on M3 (history, "left as
written").

- [x] "Add decision" template: numbered id (`adr-0012-slug`), the four sections (one headed section),
      status `proposed`, tagged `decision`, dated; offered on request in the New entry panel.
      Optional `metadata.preview` is added from the form like any field
      Paused until the template has been used on a real project: write two or three real decisions with it
      first, then see which of these are worth building. A decision is most useful written while deciding,
      not afterwards (retrospective records tend to rationalize). Everyday "why" already has homes: version
      labels, `metadata.updated.note`, `deprecationNotice`.

- [ ] (paused) Status shown as proposed / accepted / deprecated / superseded, with a Supersede action that
      creates the linked new record and marks the old one (`deprecated` + `replacedBy` + `deprecationNotice`)
- [ ] (paused) Decisions view in the sidebar, newest first, filter by status
- [ ] (paused) Confirm before editing an accepted record, pointing at Supersede
- [ ] (paused) "Decisions affecting this entry": covered by "Used by" below

## Spec conformance pass

From reading every spec page (Processing, Conformance, Stability, Interoperability, Security,
Examples, Style guide, AGENTS.md, manifest, CHANGELOG) and comparing the app. Source in brackets.

- [x] Saving into a folder that does not exist returns a 500; create the folder, and name the copy of a
      standalone entry with a slash in its id (token ids) as one flat file [Interoperability §4,
      CHANGELOG 0.21.0: token ids may contain slashes]
- [x] Insert new entries and sections in the style guide's order instead of at the end (entries by kind,
      sections by kind then framing then audience; a copy joins its kind). Orders are read from the
      schema's enums, as the pack's lint does. Guideline items cannot be placed when added (their
      level is chosen afterwards), so a "Sort by level" button appears when they are out of order
      [Style guide §1, §4, §5; DSDS-18, 19, 21]
- [x] Rename the "Decision record" option to "Decision" ("record" is a word the vocabulary avoids for an
      entry) [Conformance §3; AGENTS.md Terminology]
- [ ] `same-as` target picker offers only items of the same section kind [Processing §4; DSDS-25]
- [ ] Warn before editing an `id`: published ids should not change; show what refers to it and offer
      to change the name instead [Style guide §6; Specification §3.1; CHANGELOG 0.23.0]
- [ ] "Used by" panel on each entry from the resolver's `incoming` pointers [Processing §5; Conformance §2]
- [ ] Show a reusing item's effective content (level, statement) from its `same-as` target
      [Processing §4; CHANGELOG 0.21.1]
- [ ] Follow and show the successor of a deprecated entry [Processing §5, §7]
- [ ] Offer to declare `metadata.platforms` when creating a project [Conformance §9]
- [ ] `dsds:` autocomplete: skip code spans and accept an uppercase scheme [Processing §2.4]
- [ ] Smoke test: render the form for every pack example entry and fail on a crash or an empty value
      added by an Add button [Examples page]

## M4: Import / export / migration

- [ ] Import file / paste / folder / zip
- [ ] Export bundled, split (zip), YAML/JSON, formatted, validation report, rendered view
- [ ] Schema upgrade flow using pack migration scripts: run `migrate-to-0.2x.js` once over all of a
      project's files (`--dry-run` first), then `dsds-format` and `dsds-validate`; never run a script on
      another's output; unmigratable data lands under `$extensions["com.dsds.migration"]`; review the
      result in the entry diff and save a version [Stability: migration guides; CHANGELOG 0.22.0]
- Scope note: the spec defines nothing about converting to other formats [Interoperability]; import and
  export stay within DSDS (YAML and JSON, bundled and split)

## M5: Future-proofing proof

- [ ] Synthetic "future" pack with a new field and kind: app handles it with zero code change
