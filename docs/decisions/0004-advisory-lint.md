# 0004: Advisory lint runs the pack's own script

## Context

Packs ship two tiers of checks. `validate.js` answers "is this document allowed?" and is loaded
in-process. `lint-docs.js` answers "is this documentation good?" (rules marked `enforcement:
advisory`, e.g. DSDS-14, DSDS-15). It is a CLI: it parses argv, writes a report and calls
`process.exit`, so it cannot be `require`d.

## Decision

- `src/server/validator/lint.ts` runs the pack's `lint-docs.js --json` as a child process, once per
  validation pass for all files that changed, with the project directory as cwd. It is not
  reimplemented (rule 2: upstream rules are executed by the pack).
- Results are cached by file path, mtime and size, so an unchanged file is not linted again.
- Findings go in `ValidationResult.advice`, kept apart from `findings`. They never change `ok`,
  `errors` or `warnings`, so advice cannot block anything (rule: never block the user).
- If the script cannot run or its output is not JSON, there is simply no advice.
- The panel shows them under "Advice", each clickable like a finding.

## Consequences

- One Node process start (about 50 ms) per pass that touches a changed file; unchanged files are free.
- The linter reads the file from disk, so advice always reflects what is saved. Form and YAML edits
  both save before the next validation, so this matches what the user sees.
- A new pack version needs no code change as long as it keeps the `--json` report shape.
