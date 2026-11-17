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
- [x] `dsds:` inline-link autocomplete in Markdown fields (form + code panel)
- [x] Validation panel, click to jump to field
- [x] Live code panel with two-way sync and cross-view field highlighting; remove entries
- [x] Browser walkthrough: dark and light mode, narrow widths (the code panel shrinks so the form keeps
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
- [x] Custom kinds take a plain name: the namespace the schema requires (`acme.widget`) is added from
      the project already uses (else the system entry's id) and hidden everywhere (sidebar, kind field, diff). Reported by use
      [Style/schema: `common/id` namespaced pattern]
- [x] `same-as` target picker offers only items of the same section kind [Processing §4; DSDS-25]
- [x] Warn before editing an `id` (entry ids that something points at; offers to update the pointers): published ids should not change; show what refers to it and offer
      to change the name instead [Style guide §6; Specification §3.1; CHANGELOG 0.23.0]
- [x] "Used by" panel on each entry from the resolver's `incoming` pointers [Processing §5; Conformance §2]
- [x] Show a reusing item's effective content (level, statement) from its `same-as` target
      [Processing §4; CHANGELOG 0.21.1]
- [x] Follow and show the successor of a deprecated entry or trait value, to the end of the chain, without
      choosing between several [Processing §5, §7]
- [x] Offer to declare `metadata.platforms` when creating a project (optional field on the create
      form, saved as valid ids) [Conformance §9]
- [x] `dsds:` autocomplete: skip code spans and fenced code, accept an uppercase scheme, in the form and
      in the YAML view [Processing §2.4]
- [x] Smoke test: render the form for every pack example entry and fail on a crash or an empty value
      added by an Add button [Examples page] (`tests/form-smoke.test.tsx`; blank strings are the
      deliberate starter for required text, so only `null` and `{}` count as empty)

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

## M6: Graph view

A relationship graph over the project resolver's data (outgoing pointers plus computed `incoming`).
Prototype and research: https://claude.ai/artifact/UFfe9s2H4oXDcRPcrFnccB. Layout engine: `d3-force`
(layout only; we draw the SVG ourselves so all colour and line styling stays on tokens). Record the
dependency choice in an ADR. Reference implementation to read first: Quartz's graph component.

Approach: reuse existing open-source code (d3, Quartz's graph component and similar) so the graph
scales to large projects, and write our own only where nothing fits. Check each license before
copying code, and keep attribution. Whatever is reused must still meet the rules: colours from
tokens, a keyboard and list path, no `dsds:` `href`s.

- [ ] Graph model in `src/shared`: nodes and edges from the resolver (typed relations, plus inline
      `dsds:` links as their own filterable relation group), neighbourhood by depth (1-3) and
      direction, relation and kind filters, plus issue flags (DSDS-08 missing target, DSDS-06 `uses`
      cycle, no relations). Relation and kind lists come from the active pack's schema, never
      hardcoded; unknown values render as a generic node and a neutral dotted edge
- [ ] Graph tokens in `tokens.css` (`--color-graph-*`): kind colours and relation line styles, light and
      dark; `check:tokens` stays green
- [ ] Local graph panel beside the entry editor: depth, direction and relation filters, selection
      inspector, "re-center here"; filters are remembered separately for local and global. Nodes can
      be dragged to untangle a view; positions are not saved and reset when the view changes
- [ ] Keyboard and list alternative: Tab and arrow-key navigation, Enter selects, a Graph/List switch
      showing the same neighbourhood as a table; nodes are in-app buttons, never `dsds:` `href`s
- [ ] Issues overlay fed by the pack validator's findings (DSDS-05, -06, -08), not reimplemented; the
      Issues list jumps to the graph node and the form field
- [ ] Global graph behind the same filters, opened from the project sidebar, with "hide unlinked entries"
- [ ] Tests: graph model against `packs/*/examples` and the conformance vectors (cross-file, cycles,
      inverse); layout is deterministic for a given input
- [ ] Scale spike (before the global graph): try the reused layout and renderer on a synthetic project
      of 500 and 2000 entries; check frame rate, token styling and keyboard access. Pick the renderer
      (SVG, or canvas/WebGL if SVG is too slow) from the result and record it in the ADR. Large views
      also get a notice and filter suggestions
