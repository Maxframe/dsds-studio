# 0007: Opening a folder from anywhere on disk

Status: accepted

## Context

Specs are meant to live next to the tokens in a design system repo that belongs to someone else.
Studio's projects were folders it created inside `workspace/`. M3c opens a folder where it is, without
moving files, without writing to that repo's git, and with the validator still able to check that a
token `source` exists.

## Decision

- **A linked folder is a project whose directory is its documentation folder.** `Workspace.dirOf(slug)` returns
  `<root>/<documentationDir>`, so reading, editing, validation, versions and diff work unchanged. The list of
  linked folders is a registry file in the data folder, one per workspace. Studio's configuration
  (token folder, documentation folder) lives there, not in the opened folder.
- **The server lists folders.** A browser file dialog gives no real paths. `GET /api/fs/folders`
  lists subfolders (no hidden ones) and `GET /api/fs/inspect` suggests where documents and tokens are.
  Neither reads or writes anything; a folder is only opened by `POST /api/projects/link`, which
  refuses paths that climb out of the folder and folders that belong to Studio itself.
- **Tokens stay where they are; a link makes them reachable.** DSDS-11 only checks relative `source`
  paths inside the folder of the file being validated (pack rule, not ours to change). With the box
  ticked, Studio creates a symbolic link `tokens/` in the documentation folder pointing at the token folder
  (relative target). The link is the one thing besides the starter document that Studio adds to the
  repo. It is not created when the tokens are inside the documentation folder already, when the documentation folder is
  inside the token folder (it would loop), or when `tokens` exists.
- **Symbolic links are never followed** when counting documents, discovering project files, diffing
  or taking a snapshot, so a linked token folder is neither scanned nor copied into versions.
- **A save of whole text is refused if the file changed on disk.** The API remembers a hash of each
  document it last served or wrote; `PUT /file` compares it with the disk and answers 409 on a
  difference (for example after a `git pull`). Edits by JSON Pointer re-read the file, so they apply
  to the current text. Restores, discards and stamping forget the hashes, because they change files
  behind the API. After a restart nothing is remembered, so the first save is allowed.
- **Stop listing** removes the registry entry only. Files and saved versions stay.
- **A project is named after the design system, not the folder.** The list and the toolbar show the name
  of the system entry (else the base document's `name`); linking asks for a name, with no default from
  the folder, and the project id is made from it. Renaming the system in its document renames the project.
- **Naming:** the folder is called "documentation" (`documentationDir`). Registry entries written
  while it was called "spec" (`specDir`) are still read.

## Consequences

- No write access is needed beyond the documentation folder and the `tokens/` link.
- The link can be committed by the repo owner or ignored; Studio never touches their git.
- Moving the opened folder starts a new version history (the store is keyed by absolute path).
- The registry is local; another machine needs its own setup.
