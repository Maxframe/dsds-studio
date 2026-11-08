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
- The list-item controls (move up/down, remove) are now ghost icon buttons in the foreground
  colour, 24px square. Still open: whether to show them only on hover.
- Tree rows vary in height (28 or 48px) because long ids wrap onto a second line. Option: one line per
  row with the id truncated and the full id in a tooltip, so every row is the same height.
- The tree has no collapsing: long kind groups push everything down. Option: collapsible groups with
  counts, remembered per project.
- Signature detail: the highlight that links a form field and its YAML row is the app's one
  distinctive interaction. Option: use it more (hover a validation finding to light both views).
- Light mode has not been walked through after the consistency pass (dark mode only was checked).
- The form uses the full width of the middle column, so inputs get very wide on large screens.
  Option: cap the width with a layout token.
- The right column is fixed at 34rem (`--layout-panel-width`). Option: draggable divider.

## Done

- shadcn migration (ADR 0003): buttons, inputs, selects, the ref picker, the `dsds:` suggestions
  and collapsible tree groups now use shadcn components. Open-set fields like `kind` use shadcn's Combobox (Base UI), showing standard and in-use values. Tree groups are collapsible (Collapsible); their state is not remembered.

- shadcn/ui look: `tokens.css` now uses shadcn's default "neutral" theme (OKLCH palette, 0.625rem
  radius, shadow-md). The accent is near-black (near-white in dark), not a hue, so selection and
  hover are neutral surface steps. Components are unchanged. Not adopted: shadcn's Geist/Inter
  font (needs a font file) and the Tailwind/Radix components themselves (they conflict with the
  tokens-only rule).

- Consistency pass: every control (input, button, tree row) has a minimum height from
  `--control-height`; icon buttons inherit the app font and have a 24px hit area; section labels are
  sentence case, medium weight; only weights 400 and 500 are used (`--weight-*`); hover is a surface
  step, selected is the accent tint; colour changes use one short transition (`--motion-*`), off under
  reduced motion.

- Remove optional fields: a ✕ at the right of every optional field that is present (also for
  fields the schema doesn't know). Required fields have none. Nested content asks first.
- Remove any entry (button in the editor and in the tree, with an in-app confirmation; a
  standalone entry's file is moved to `.dsds-trash/`).
- Live YAML panel to the right of the form, two-way and live; the focused field is highlighted
  in the other view, and moving the YAML cursor into another entry switches the form to it.
