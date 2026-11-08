# 0003: shadcn/ui components on Tailwind, mapped to our tokens

Status: accepted.

## Context

The UI was hand-written React and CSS. Behaviour we hand-rolled (the ref picker was a native
`<datalist>`, the `dsds:` suggestion list is a hand-built combobox) lacks keyboard and ARIA
behaviour that Radix provides, and every control had its own CSS.

## Decision

- Add Tailwind v4 (`@tailwindcss/vite`) and shadcn/ui components in `src/web/components/ui/`. Every
  file there comes from the official registry (`npx shadcn@latest view <name>`, new-york-v4),
  not from memory, and says in its header comment what was adapted: Button, Input, Textarea,
  Select, Popover, Command, Collapsible, Combobox (Base UI) and a trimmed InputGroup. Radix comes
  from the `radix-ui` umbrella package, like the official files.
- Adaptations, kept small so a file can be re-synced from the registry: `cn` from `@web/lib/utils`;
  control heights from `--control-height`; `shadow-xs`, `dark:*` and the `animate-in/out` classes
  dropped (the tokens switch with the theme; the animations need tw-animate-css); `Button` defaults
  to `type="button"`; `Textarea` keeps `rows` instead of `field-sizing-content`; `Select` opens
  `popper`; `CommandDialog` and the Popover header/title parts are not copied (unused).
  `input.tsx` also exports `fieldClass`, shared by Input, Textarea and the select trigger.
- `src/web/styles/tailwind.css` loads only Tailwind's `theme` and `utilities` layers, not the full
  preflight reset, so the hand-written CSS keeps working. Official files assume a few preflight
  rules, so a `base` layer adds them: form controls inherit font and colour and start transparent,
  and borders default to `--color-border` (shadcn's own global rule). Unlayered CSS beats layered,
  so old rules win over utilities: remove the old class when a component moves over.
- The same file maps shadcn's names onto our tokens, so `tokens.css` stays the one place to
  restyle. Tailwind only makes a utility (`bg-primary`) for a name declared in `@theme`, so each
  name is declared, the ones that already carry shadcn's name mapping to themselves (a cycle in
  Tailwind's layered `:root`, harmless because unlayered `tokens.css` wins; keep it unlayered).
  `--shadow-md` and `--text-sm` point at `--shadow-popover` and `--text-small`, so official
  classes follow our tokens.
- Tokens use shadcn's names: `--color-primary` (was `--color-accent`), `--color-primary-foreground`,
  and `--color-accent` for the hover/highlight surface, so official files work unchanged.
- The ref picker and open-set fields (`kind`) use the Combobox (`form/ComboboxField.tsx`; the
  `OpenSetWidget` and `RefCombobox` wrap it). It only selects from its list, so text that is not
  listed is offered as one more row, "Use ...". Only a chosen row (click or Enter) or the clear
  button commits. Emptying the text reports "no selection" and must not commit (it would blank a
  required field). Leaving the field drops what was typed.
- Groups: Standard (from the schema, no hardcoding) and Custom, in use (values other fields
  hold), each row with how many other fields use it. `shared/field-usage.ts` finds them: list
  positions in the pointer are wildcards, and an entry's own `kind` counts every other entry in
  the project, in any file. Other fields only see the open document.
- Radix Select forbids an empty item value, so "(not set)" and the generic entry kind use sentinel
  values. The "Add field" and "Add section" menus are Selects held at value `""`.
- The `dsds:` suggestion popover must not take focus: the textarea keeps it and drives the active
  row (`onOpenAutoFocus` prevented, filtering stays in `suggestTargets`, cmdk `shouldFilter={false}`).
- Tests open Radix selects through `tests/select.ts` (`optionsOf`, `choose`).

## Consequences

- `check:tokens` still passes: utilities carry no raw lengths. It no longer proves that every
  value comes from a token, because Tailwind's scale (`px-4`) is allowed. CLAUDE.md rule 4 should
  be reworded if this stays.
- Tests that use Radix need the jsdom stubs in `tests/dom-polyfills.ts`.
- Radix Select forbids an empty item value, so "(not set)" and the generic entry kind use
  sentinel values. The "Add field" and "Add section" menus are Selects held at value `""`.
- The `dsds:` suggestion popover must not take focus: the textarea keeps it and drives the active
  row (`onOpenAutoFocus` prevented, filtering stays in `suggestTargets`, cmdk `shouldFilter={false}`).
- Tests open Radix selects through `tests/select.ts` (`optionsOf`, `choose`).
- Open-set fields (a schema string that lists standard values but allows others, such as `kind`)
  and the ref picker use shadcn's Combobox (Base UI): `components/ui/combobox.tsx` and a trimmed
  `input-group.tsx`, from `npx shadcn view combobox`, adapted to our tokens (no enter/exit
  animation classes, no chips). `form/ComboboxField.tsx` wraps it; `OpenSetWidget` and
  `RefCombobox` are thin layers. Base UI is a second headless library next to Radix.
- shadcn's Combobox only selects from its list. A value that is not listed is offered as one more
  row, "Use ...", and only a chosen row (click or Enter) or the clear button commits. Emptying the
  text reports "no selection" and must not commit (it would blank a required field). Leaving the
  field drops what was typed.
- Groups: Standard (from the schema, no hardcoding) and Custom, in use (values other fields
  hold). Each row says how many other fields use it. `shared/field-usage.ts` finds them: list
  positions in the pointer are wildcards, and an entry's own `kind` counts every other entry in
  the project, in any file. Other fields only see the open document.
- Tokens now use shadcn's names: `--color-primary` (was `--color-accent`), `--color-primary-foreground`,
  and `--color-accent` for the hover/highlight surface, so official files work unchanged. Tailwind
  only makes a utility for a name declared in `@theme`, so `tailwind.css` maps each name, the
  shadcn-named ones to themselves.
- Left for later: the inline confirm is not an AlertDialog (it is easier to test and has no
  modal), and the Resizer. Fields without standard values stay plain text inputs.
