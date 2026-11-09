# DSDS Studio

Local app to create, validate, version, import and export
[Design System Doc Spec](https://github.com/somerandomdude/design-system-documentation-schema)
documents. It is driven by vendored schema releases ("packs"), so it keeps working when the spec
changes.

```bash
npm run setup                  # npm install; falls back to the public registry if your configured one fails
npm run pack:add -- v0.23.1   # vendor the schema release (once)
npm run example:create         # optional: a rich example project in workspace/
npm run dev                    # http://localhost:5173
npm run check                  # typecheck + lint + format + tokens + tests
```

See `CLAUDE.md` (rules for AI-assisted work), `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`.
