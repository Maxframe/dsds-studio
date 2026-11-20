#!/usr/bin/env python3
"""Build the Oblique token slice (interaction, neutral and status color, density) as DSDS 0.23.1 docs.

Reads Token Studio JSON (read-only) and writes into a DSDS documentation folder. Token entries never
carry values: `source` points at the Token Studio file + JSON pointer (option A, see FINDINGS.md).

Ownership: this script owns the derived fields of token and theme entries (id, tokenType, source,
uses, combos, tags, group, aliases, the description of a token). A person owns everything else:
sections, refs, status, the name of an entry once it exists, and a theme's description. A rerun
keeps those. Foundation entries (the rules written for people and agents) are written by hand
and are not touched here.

Layout: all documents sit flat in the documentation folder, next to a link `tokens/` that points at
the token folder, so every `source` is `./tokens/<file>#<pointer>` and DSDS-11 can check it (the rule
only looks inside the folder of the file it validates). Entries this script did not create are kept.

Usage: python3 build_slice.py <themes dir> <contrast-pairings.json> <documentation dir>
"""
import json, os, re, sys, urllib.parse
from collections import defaultdict
import yaml

THEMES, PAIRINGS, OUT = (os.path.abspath(p) for p in sys.argv[1:4])
SCHEMA = "0.23.1"
SCHEMA_URL = f"https://designsystemdocspec.org/v{SCHEMA}/dsds.bundled.yaml"
ALIAS = re.compile(r"\{([^{}]+)\}")
DOC_KEYS = {"_docs", "token_family_docs"}

# Which Token Studio file is which mode. 'static' files are mode-independent.
AXES = {"s1_lightness": "lightness", "s2_emphasis": "emphasis", "density": "density"}
DEFAULT_MODE = {"lightness": "light", "emphasis": "high", "density": "standard"}
MODES = {"lightness": ["light", "dark"], "emphasis": ["high", "low"],
         "density": ["standard", "compact", "spacious"]}

SEEDS = [r"^ob\.s\.color\.(interaction|neutral|status)\.", r"^ob\.s\.dimension\.(static|dynamic)\.density\.",
         r"^ob\.g\.mode_collection\.(lightness|emphasis|density)\."]

TIERS = [  # (prefix, document file, document name, tag)
    ("ob.p.", "tokens-primitive.dsds.yaml", "Oblique primitive tokens", "primitive"),
    ("ob.g.", "tokens-global.dsds.yaml", "Oblique global tokens (mode collections)", "global"),
    ("ob.s1.", "tokens-semantic-s1.dsds.yaml", "Oblique semantic S1 tokens (lightness-resolved)", "semantic-s1"),
    ("ob.s2.", "tokens-semantic-s2.dsds.yaml", "Oblique semantic S2 tokens (emphasis-resolved)", "semantic-s2"),
    ("ob.s.", "tokens-semantic.dsds.yaml", "Oblique semantic tokens (compiled)", "semantic"),
]

todo, conflicts = [], []


def mode_of(rel):
    parts = rel[:-5].split("/")
    for i, p in enumerate(parts[:-1]):
        if p in AXES:
            return AXES[p], parts[-1] if parts[-1] != "static" else None
    return None, None


# ---- index every token and every family-doc text in the source -----------------------------
tokens = defaultdict(list)  # id -> [(relfile, axis, mode, node)]
family_docs = {}  # (group path, relfile) -> text


def walk(node, path, rel):
    if not isinstance(node, dict):
        return
    if "$value" in node:
        tokens[".".join(path)].append((rel, *mode_of(rel), node))
        return
    for k, v in node.items():
        if k in DOC_KEYS:
            text = v.get("$description") if isinstance(v, dict) else None
            for sub in (v.values() if isinstance(v, dict) else []):
                if isinstance(sub, dict) and "$value" in sub:
                    text = sub["$value"]
            if text:
                family_docs[(".".join(path), rel)] = text
        elif not k.startswith("$"):
            walk(v, path + [k], rel)


for root, _, files in os.walk(THEMES):
    for f in sorted(files):
        if f.endswith(".json") and not f.startswith("$"):
            rel = os.path.relpath(os.path.join(root, f), THEMES)
            walk(json.load(open(os.path.join(root, f))), [], rel)

# ---- slice = seeds + transitive alias closure ------------------------------------------------
slice_ids = {t for t in tokens if any(re.match(s, t) for s in SEEDS)}
queue = list(slice_ids)
while queue:
    tid = queue.pop()
    for _, _, _, node in tokens[tid]:
        for ref in ALIAS.findall(str(node["$value"])):
            if ref not in tokens:
                todo.append(f"`{tid}`: alias `{{{ref}}}` points at no token in the source.")
            elif ref not in slice_ids:
                slice_ids.add(ref)
                queue.append(ref)


def pointer(tid):
    return "#/" + "/".join(p.replace("~", "~0").replace("/", "~1") for p in tid.split("."))


def href(doc_file, rel, tid):
    """`./tokens/<file>#<pointer>`: the link `tokens/` in the documentation folder points at THEMES."""
    return "./tokens/" + urllib.parse.quote(rel) + pointer(tid)


WORDS = {"fg": "foreground", "bg": "background", "px": "px", "rem": "rem"}


def human(tid, prefix):
    segs = tid[len(prefix):].split(".")
    return " · ".join(WORDS.get(s, s.replace("_", " ")) for s in segs).capitalize()


def pick_default(defs):
    for d in defs:
        if d[2] is None or d[2] == DEFAULT_MODE.get(d[1]):
            return d
    return defs[0]


pairs = json.load(open(PAIRINGS))["categories"]

# ---- facts read from the token repo ---------------------------------------------------------
REAL = os.path.realpath(THEMES)
THEMES_JSON = json.load(open(os.path.join(THEMES, "$themes.json")))
SET_STATUS = defaultdict(set)  # token set path -> statuses over all themes
for _t in THEMES_JSON:
    for _set, _st in _t.get("selectedTokenSets", {}).items():
        SET_STATUS[_set].add(_st)
CSS_FILE = os.path.join(REAL, "..", "css", "layers", "tokens.css")
CSS_VARS = set(re.findall(r"(--ob-[A-Za-z0-9_-]+)\s*:", open(CSS_FILE).read())) if os.path.exists(CSS_FILE) else set()
NO_FIGMA_TYPES = {"duration", "cubicBezier", "other", "asset", "textAlign"}  # 02-token-tiers/00-overview.md
LABELS = {"FIGMA-ONLY": "figma-only", "NO-FIGMA": "no-figma", "NO-CODE": "no-code"}
CONSUMPTION = {"p": "internal", "s1": "internal", "s2": "internal", "g": "configuration",
               "s": "consumable", "c": "consumable", "h": "consumable"}


def tier_of(tid):
    return tid.split(".")[1]


def family_of(tid):
    """`color.interaction`, `dimension.density`, `mode_collection.density`: category and family."""
    seg = tid.split(".")[2:]
    if len(seg) >= 2 and seg[0] == "dimension" and seg[1] in ("static", "dynamic"):
        seg = [seg[0], *seg[2:]]
    return ".".join(seg[:2]) if len(seg) >= 2 else ".".join(seg)


def in_figma(defs):
    """True/False when the token sets say it, None when unknown."""
    states = set()
    for d in defs:
        states |= SET_STATUS.get(d[0][:-5], set())
    if not states:
        return None
    return "enabled" in states


NEUTRAL_FG = re.compile(r"^ob\.s\.color\.neutral\.fg\.contrast_(high|medium|low)\.inversity_(normal|flipped)$")
STATUS_BG = re.compile(r"^ob\.s\.color\.status\.[a-z_]+\.bg\.contrast_(high|medium|low)\.inversity_(normal|flipped)$")


def combos_for(tid):
    rules = defaultdict(list)
    if NEUTRAL_FG.match(tid):
        bad = sorted(t for t in slice_ids if STATUS_BG.match(t))
        if bad:
            rules[("must-not", "Never pair neutral foreground with a status background (documentation/03-token-categories/colors/07-semantic-status.md, Prohibited Pairing). Use the status foreground of the same status, or status fg contrast_highest.")] += ["{" + t + "}" for t in bad]
    for cat, items in pairs.items():
        for p in items:
            if p["fg"] != tid or p.get("bg") is None:
                continue
            if p["bg"] not in slice_ids:
                todo.append(f"`{tid}`: pairing with `{p['bg']}` ({p['usage']['tier']}, {p['ratio']}:1) left out, background token not in the slice.")
                continue
            u = p["usage"]
            level = {"aaa": "should", "aaNormal": "should", "aaLarge": "may", "fail": "must-not"}.get(u["tier"])
            if not level:
                todo.append(f"`{tid}`: unknown pairing tier `{u['tier']}`.")
                continue
            note = (f"Contrast {p['ratio']}:1 ({u['tier']}) in the default modes. Content: {u['recContent']}. "
                    f"Component sizes: {u['recComponent']}. Not for: {u['notContent']} / {u['notComponent']}.")
            if p.get("emph"):
                note += f" {p['emph']}."
            rules[(level, note)].append("{" + p["bg"] + "}")
    return [{"subject": "{" + tid + "}", "level": lvl, "items": items, "note": note}
            for (lvl, note), items in rules.items()]


def token_entry(tid, prefix, doc_file, tag):
    defs = tokens[tid]
    rel, axis, mode, node = pick_default(defs)
    types = {d[3].get("$type") for d in defs}
    descs = {d[3].get("$description") for d in defs} - {None, ""}
    if len(types) > 1:
        conflicts.append(f"`{tid}` | `$type` | {sorted(types)} | differs between mode files")
    desc = node.get("$description") or ""
    if not desc:
        todo.append(f"`{tid}`: no `$description` in `{rel}`; description left empty.")
    label = re.match(r"\s*\[(FIGMA-ONLY|NO-FIGMA|NO-CODE)\]", desc)
    tags = [tag, CONSUMPTION[tier_of(tid)]] + ([axis] if axis else [])
    figma_note = None
    if label:
        tags.append(LABELS[label.group(1)])
    elif node.get("$type") in NO_FIGMA_TYPES:
        tags.append("no-figma")
        figma_note = f"$type {node.get('$type')} has no Figma variable (02-token-tiers/00-overview.md)"
    elif in_figma(defs) is False:
        tags.append("no-figma")
        figma_note = "token set is not enabled in any theme (source only), so no Figma variable exists"
    entry = {
        "kind": "token", "id": tid, "name": human(tid, prefix), "description": desc,
        "metadata": {"tags": tags, "status": {"status": "draft"}, "group": family_of(tid)},
    }
    css_var = "--" + tid.replace(".", "-")
    if css_var in CSS_VARS:
        entry["metadata"]["aliases"] = [css_var]
    # uses = alias targets, with the modes they apply in when not all modes agree
    used = defaultdict(set)
    for d in defs:
        for ref in ALIAS.findall(str(d[3]["$value"])):
            if ref in tokens:
                used[ref].add(d[2] or "static")
    all_modes = {d[2] or "static" for d in defs}
    if used:
        entry["uses"] = []
        for ref, ms in used.items():
            u = {"to": ref}
            if ms != all_modes:
                u["note"] = f"Only in {axis} mode {', '.join(sorted(ms))}."
            entry["uses"].append(u)
    tt = node.get("$type")
    if tt:
        entry["tokenType"] = tt
    entry["source"] = href(doc_file, rel, tid)
    combos = combos_for(tid)
    if combos:
        entry["combos"] = combos
    entry["$extensions"] = {"oblique.source": {
        "type": "tokens", "ref": rel + pointer(tid), "confidence": "high",
        "modeFiles": [d[0] for d in defs] if len(defs) > 1 else None,
        "derived": {k: v for k, v in {
            "name": "generated from the token path",
            "combos": "scripts-custom/figma-doc-builders/color-pairings/contrast-pairings.json (generated from Figma variables); level mapped from WCAG tier, confidence medium" if combos else None,
            "otherDescriptions": sorted(descs - {desc}) or None,
            "tags": "tier, consumption (internal/consumable/configuration) from the tier letter; no-figma: " + figma_note if figma_note else None,
            "aliases": "CSS custom property, only when it exists in src/lib/css/layers/tokens.css" if css_var in CSS_VARS else None,
        }.items() if v}}}
    if not entry["$extensions"]["oblique.source"]["modeFiles"]:
        del entry["$extensions"]["oblique.source"]["modeFiles"]
    return entry


def merge(new, old, keep_description=False):
    """Derived fields from `new`; everything a person owns from `old`."""
    if not old:
        return new
    out = dict(new)
    out["name"] = old.get("name", new["name"])
    if keep_description and "description" in old:
        out["description"] = old["description"]
    for k, v in old.items():
        if k not in new and k not in ("metadata", "$extensions"):
            out[k] = v
    md = {**old.get("metadata", {}), **{k: v for k, v in new["metadata"].items() if k != "status"}}
    md["tags"] = list(dict.fromkeys([*new["metadata"].get("tags", []), *old.get("metadata", {}).get("tags", [])]))
    md["status"] = old.get("metadata", {}).get("status", new["metadata"]["status"])
    if "aliases" not in new["metadata"]:
        md.pop("aliases", None)
    out["metadata"] = md
    out["$extensions"] = {**old.get("$extensions", {}), **new.get("$extensions", {})}
    return out


def existing(doc_file):
    path = os.path.join(OUT, doc_file)
    if not os.path.exists(path):
        return {}
    return {e["id"]: e for e in yaml.safe_load(open(path)).get("entries", []) if "id" in e}


def write(doc_file, doc):
    path = os.path.join(OUT, doc_file)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        yaml.safe_dump(doc, fh, sort_keys=False, allow_unicode=True, width=100)


counts = {}
for prefix, doc_file, name, tag in TIERS:
    ids = sorted(t for t in slice_ids if t.startswith(prefix)
                 and not any(t.startswith(p) for p, *_ in TIERS if len(p) > len(prefix)))
    counts[doc_file] = len(ids)
    old = existing(doc_file)
    write(doc_file, {"$schema": SCHEMA_URL, "schemaVersion": SCHEMA, "name": name,
                     "entries": [merge(token_entry(t, prefix, doc_file, tag), old.get(t)) for t in ids]})

# ---- themes: one per mode of the three axes in the slice -------------------------------------
themes = []
for axis, modes in MODES.items():
    for m in modes:
        files = sorted({d[0] for t in slice_ids for d in tokens[t] if d[1] == axis and d[2] == m})
        sel = f"ob.g.mode_collection.{axis}.{m}.selector"
        desc = tokens[sel][0][3].get("$description", "") if sel in tokens else ""
        th = {"kind": "theme", "id": f"{axis}-{m}", "name": f"{axis.capitalize()}: {m}",
              "description": desc,
              "metadata": {"tags": ["mode", axis], "status": {"status": "draft"}, "group": f"mode.{axis}"}}
        if m != DEFAULT_MODE[axis]:
            th["extends"] = [{"to": f"{axis}-{DEFAULT_MODE[axis]}"}]
        if sel in slice_ids:
            th["uses"] = [{"to": sel, "note": "The CSS class that activates this mode."}]
        if axis == "lightness":
            th["colorScheme"] = m
        if files:
            th["source"] = {"href": href("x.dsds.yaml", files[0], "x").split("#")[0],
                            "note": f"Token Studio set for this mode. Also: {', '.join(files[1:])}." if len(files) > 1
                            else "Token Studio set for this mode."}
        th["$extensions"] = {"oblique.source": {"type": "tokens", "ref": sel, "confidence": "high",
                                                "modeFiles": files, "axis": axis}}
        themes.append(th)

def find_root():
    for name in sorted(os.listdir(OUT)):
        if not name.endswith((".dsds.yaml", ".dsds.yml")) or name.startswith("tokens-"):
            continue
        doc = yaml.safe_load(open(os.path.join(OUT, name)))
        if isinstance(doc, dict) and "schemaVersion" in doc and "entries" in doc:
            return os.path.join(OUT, name)
    return None


root_file = find_root()
generated = themes
generated_ids = {e["id"] for e in generated}
if root_file:
    root = yaml.safe_load(open(root_file))
    old_by_id = {e.get("id"): e for e in root["entries"]}
    kept = [e for e in root["entries"] if e.get("id") not in generated_ids]
    generated = [merge(t, old_by_id.get(t["id"]), keep_description=True) for t in themes]
else:
    root_file = os.path.join(OUT, "oblique.dsds.yaml")
    root = {"$schema": SCHEMA_URL, "schemaVersion": SCHEMA, "name": "Oblique", "entries": []}
    kept = [{"kind": "system", "id": "oblique", "name": "Oblique",
             "description": "Describe what this design system is and who it is for."}]
refs = [r for r in root.get("refs", []) if not (r.get("rel") == "file" and r.get("href", "").startswith("./tokens-"))]
refs += [{"href": "./" + f, "rel": "file"} for _, f, *_ in TIERS]
root["refs"] = refs
root["entries"] = kept + generated
yaml.safe_dump(root, open(root_file, "w"), sort_keys=False, allow_unicode=True, width=100)

json.dump({"counts": counts, "themes": len(themes), "css_vars_found": len(CSS_VARS),
           "todo": todo, "conflicts": conflicts}, sys.stdout, indent=1)
