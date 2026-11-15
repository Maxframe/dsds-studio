# Prompts for each pass

Start each session from `workspace/oblique/` so the agent reads `AGENTS.md`. Replace `<...>`.

## Pass 0: orientation (always first)

```text
Read AGENTS.md. Then list the entry kinds and section kinds available in
<path>/packs/0.23.1/schema, and summarise in a table which kind fits tokens, components,
patterns and foundations. Do not edit anything. Then confirm you can reach the Figma MCP by
listing the component sets in <figma URL>.
```

## Pass 1: tokens

```text
Convert the Token Studio files in ~/oblique-sources/tokens/<path> into token entries in this spec,
following the mapping in AGENTS.md. Keep aliases as references to other token entries, not as
copied values. Do this with a small script if the volume is large, and keep the script out of the
spec repo. Validate, report counts per token group, and list anything that did not map cleanly.
Do not touch components yet.
```

## Pass 2: component skeletons

```text
Using the Figma MCP (read-only), list every component set in <figma URL>. Create one skeleton entry
per component: id, name, description from the Figma description if present, status draft. Nothing
else. Output a table of Figma name, entry id, and anything ambiguous (duplicate names, WIP pages,
deprecated markers). Stop for my review before the next pass.
```

## Pass 3: pilot component

```text
Fill the entry for <Button> completely. Use: Figma (variants, states, anatomy, token bindings via
get_variable_defs), the Angular source at ~/oblique-sources/code/<path> (inputs, outputs, selectors),
and the docs at ~/oblique-sources/docs/<path> (usage, accessibility). Link tokens to the existing
token entries by id. Record provenance per AGENTS.md. List conflicts and gaps. Validate. Then tell
me what in AGENTS.md or this prompt should change to make the next component better.
```

## Pass 4: batches

```text
Repeat the pilot process for these components: <A, B, C>. Use the pilot entry <Button> as the style
reference. Only these components. One commit per component. Validate after each.
```

## Pass 5: prose sections

```text
For <component or foundation>, draft the guidelines (when to use, when not to), content guidance and
accessibility sections from ~/oblique-sources/docs/<path> only. Quote nothing you cannot point to.
Mark each section's provenance. Keep status draft.
```

## Pass 6: drift check

```text
Compare the spec with the current sources. (1) Tokens: diff Token Studio output against token
entries. (2) Components: diff Figma component sets and variants against entries. (3) API: diff the
Angular inputs and outputs against the entries. On a new branch, apply the changes you are sure
about, and list the rest in CONFLICTS.md. Do not touch entries marked status: stable without
listing them in the summary.
```
