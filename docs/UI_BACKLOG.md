# UI backlog

Proposals for how the app looks and feels. Add items here (or tell the agent and it will).
Each item: what you see, what you want instead, and why. Items are picked up in batches.

**Kinds of change, cheapest first**

1. **Visual only** (colors, spacing, radius, type sizes, dark mode): edit `src/web/styles/tokens.css`.
   No component changes. Can be done any time.
2. **Layout and wording** (what sits where, labels, empty states): small component or CSS edits.
3. **Flow changes** (how you add an entry, where validation shows, navigation): touch several
   components and tests. Best raised before the next milestone builds more screens on top.

## Open

Seen in the browser while testing (not yet decided, say which you want):

- The sidebar's **Documents** list is long for a split project (16 files in the example) and pushes
  the entries down. Option: collapse it by default, or show it as a folder tree.
- The list-item controls (move up/down, remove) and the new field ✕ are very faint. Option: stronger contrast, or
  show on hover with larger hit areas.
- The form uses the full width of the middle column, so inputs get very wide on large screens.
  Option: cap the width with a layout token.
- The right column is fixed at 34rem (`--layout-panel-width`). Option: draggable divider.

## Done

- Remove optional fields: a ✕ at the right of every optional field that is present (also for
  fields the schema doesn't know). Required fields have none. Nested content asks first.
- Remove any entry (button in the editor and in the tree, with an in-app confirmation; a
  standalone entry's file is moved to `.dsds-trash/`).
- Live YAML panel to the right of the form, two-way and live; the focused field is highlighted
  in the other view, and moving the YAML cursor into another entry switches the form to it.
