# 0005: Versioning model: draft is the working tree, versions are git commits

Status: superseded by 0006 (snapshots replace git; the diff and restore semantics carry over)

## Context

M3 needs drafts, quicksaves, named versions, history and restore. Edits already write straight to the
project files and validation, lint and cross-file refs read them from disk. DSDS itself says nothing
about revision storage, only that a published `id` should not change (Specification §3.1) and that
checking that across versions is left to the project.

## Decision

- **The draft is the uncommitted change set** in the project's git working tree. No separate cache:
  files on disk always match the editor, and a draft survives closing the app.
- **Saving a version is a commit** made with the local `git` CLI inside the project folder. A
  **quicksave** is a commit with an automatic timestamp label; a **named version** has a label and an
  optional tag. Both live in one history; the list folds quicksaves away by default.
- **Discard changes** returns the files to the last version.
- **Restore** creates a new commit, never rewrites history. With unsaved changes the app asks first:
  quicksave, discard or cancel.
- GitHub or any remote is optional and the user's business; the app holds no credentials.

- **The diff is structural.** `projects/diff.ts` reads the documents of two revisions (a commit via
  `git show`, or the files as they are) and compares them as parsed data, entry by entry, so key
  order, quoting and comments never count. Entries are matched by `uuid`, else `id`. A vanished or
  changed id is flagged with the deprecated-stub advice, because the validator sees one revision only
  and Specification §3.1 leaves that check to the project. Lists compare by position.

- **Restore is `read-tree -u --reset` plus a commit**, so the files (including removals) match that
  version exactly and the restore is one more version on top, recorded with a `DSDS-Restored-From`
  trailer. The server refuses while the draft is not clean; the dialog quicksaves or discards first.

- **Named versions can stamp `metadata.updated`.** Spec: consumers should use `updated.date` as the
  cache key. On a named save (checkbox, default on) every entry changed since the latest version gets
  `updated: {date: today, note: label}`, applied through the same edit pipeline as the form so the
  formatter and comments are respected. Not for quicksaves, removed entries, the base document, entries
  whose only change is an earlier stamp, or a project's first version.

## Alternatives considered

- A separate draft cache: the files lag the editor and every reader of the files (validator, lint,
  resolver) would need to read the cache.
- A lighter, pruned checkpoint set beside named versions: less clutter, but two kinds of history.
- App-owned snapshots or isomorphic-git instead of the git CLI: the app already needs a `git` binary,
  so this removes no dependency (see ADR 0001).

## Consequences

The project folder must be its own git repo (the app creates projects that way; opening an existing
folder is an M4 concern). Commits need an author: use git's configured user, else a fallback.
