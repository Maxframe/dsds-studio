# 0006: Versioning with app-owned snapshots, not git

Status: accepted. Replaces 0005 (draft is the working tree, versions are git commits).

## Context

0005 made every project its own git repo and every version a commit. That works for projects the app
creates, but not for the next use: documentation that sits inside a design system repo next to the tokens
(roadmap M3c). There Studio's commits would mix with the token authors' history, and "discard" would
stash changes that are not the spec's. 0005 listed app-owned snapshots as an alternative and rejected
them because they save no dependency. The reason to revisit is another one: the app must never write
to a repository that belongs to someone else.

## Decision

- **A version is a snapshot of the documentation folder**, stored by the app in the data folder
  (`DSDS_DATA`, default `data/`, git-ignored). The project folder holds no version data.
- **Layout:** `snapshots/<folder name>-<hash of the absolute path>/` with `blobs/<sha1>` (file
  contents, shared by all versions) and `versions/<id>.json` (manifest: `id`, `seq`, `label`, `kind`,
  `date`, `tags`, `files` as path to blob hash, `auto`, `restoredFrom`). Ids are 40 hex characters so
  the HTTP API and the web app keep their shape. Moving a project folder starts a new history.
- **The draft is the difference** between the files on disk and the latest version that is not an
  automatic one. Files on disk stay the single copy of the working state, as before.
- **Scope:** every regular file below the documentation folder except `.git`, `node_modules` and `.dsds-trash`.
  Symbolic links are skipped, so a linked token folder is never copied.
- **Quicksave and named version** are snapshots. A named one has a label and an optional tag; tags are
  unique across the project. Naming or tagging later edits the manifest only.
- **Discard and restore keep a copy first.** Before the files are replaced, an automatic snapshot of the
  current state is saved (a quicksave, flagged `auto`, labelled "Before discarding changes ..."). It
  shows up in the history, folded with the other quicksaves, so a discard can be undone from the UI.
  Automatic snapshots never count as the baseline of the draft.
- **Restore** makes the files match a version and saves that as a new version with `restoredFrom`,
  as before. It refuses while there are unsaved changes (the dialog quicksaves or discards first).
- **The structural diff** (0005) is unchanged; it reads the documents of a revision from the store.
- **No history is migrated.** Existing projects start without versions; their `.git` folders are not
  touched. The first quicksave or named version creates the first snapshot.

## Consequences

- No `git` binary is needed for versioning any more (0001 still lists git for revisions: superseded).
- No branches, merges or remote backup from the app. A project that lives in a git repo is committed by
  its owner with their own tools; the snapshots are the safety net between commits.
- Snapshots exist only on this machine, in the data folder. Deleting it deletes the history.
- A file changed from outside the app is simply part of the next draft.
