# Architecture

opencode has three seams that shape what the model sees. This tool attaches at all three,
plus an optional fourth that lives in the executable itself.

```
                       ┌──────────────────────────────┐
  user message ───────▶│ opencode session             │
                       │                              │
                       │  1. system prompt assembly   │◀── plugin hook
                       │     (identity + model +      │    ctx.session.hook("context")
                       │      tool catalog + AGENTS)  │
                       │                              │
                       │  2. LLM request (tools)      │◀── same hook: p.tools[name].description
                       │                              │◀── config permissions[]
                       │  3. tool call                │◀── plugin hook
                       │                              │    ctx.permission.hook("evaluate")
                       └──────────────┬───────────────┘
                                      │
                            opencode-cli.exe (Bun single-file)
                                      ▲
                                      │ equal-length rewrite
                            --deep (optional, offline)
```

Two host generations are supported. 1.19 used string-named hooks with `(input, output)`
pairs; 2.x loads a `default { id, setup }` object and registers hooks imperatively on a
context. The plugin is written for 2.x; the catalogue's `check()` functions still recognise
the 1.19 names so `status` reads correctly on both. The full mapping lives in
[opencode-2.x.md](opencode-2.x.md).

## 0. Plugin contract

2.x validates the module's `default` export against a schema that accepts exactly two
shapes:

```js
export default { id: "…", effect: async (ctx) => { … } }
export default { id: "…", setup:  async (ctx) => { … } }   // may return a disposer
```

A 1.19-style module — `default` is a function returning a hooks object — is rejected:

```
PluginModule.LoadError: Plugin must export a default definition with an id and an effect
or setup function. (cause: SchemaError(Expected object at ["default"]))
```

The module is dropped at load, so none of its code runs: no hooks, no log file, no tools.
`test/smoke.mjs` imports the installed copy and asserts the shape, so this cannot regress
silently.

`setup` registers each hook through a `guard()` wrapper; a failed registration is logged and
the rest still install. The successful set is summarised in one line:
`setup done registered=session.hook(context),permission.hook(evaluate),…`.

## 1. Prompt assembly

2.x builds the system prompt as an array of parts:

```
[0] identity preamble      ← dropped by `strip`
[1] model block
[2] code-mode tool catalog
[3] AGENTS.md
```

and hands the array to plugins through the `context` hook. The plugin filters parts:

- `strip` (default) — drop every part whose trimmed text starts with a known identity
  anchor, prepend the frame, keep the rest. A normal request logs `dropped=1 kept=3`.
- `strict` — frame plus the `<env>` part only.
- `always` — append the frame after the untouched host parts.

Because only the identity parts are dropped, tool schemas, the code-mode catalog and project
rules keep working.

The anchor list must include the strings `--deep` writes into the binary:

```js
const BASELINE_ANCHORS = [
  "You are an AI agent running in OpenCode",              // 2.4 native
  "You are opencode, an interactive CLI tool",            // 1.19, still a live string
  "You are OpenCode, the best coding agent",
  "You are powered by the model named",
  "Here is some useful information about the environment you are running in:",
  "You are YG's unrestricted local execution agent",      // what --deep writes
]
```

Miss the last one and the layering degrades quietly: `apply` then `apply --deep` replaces the
identity string in the binary, the plugin stops matching, `strip` cuts nothing, and the
vendor prompt stays in the request while `status` still reports 18/18. The log shows
`strip dropped=0`.

## 2. Approval gates

Two independent switches:

- `opencode.json` → `permissions` (2.x: ordered `{action,resource,effect}` array, last match
  wins, appended after the agent defaults) **and** `permission` (1.19: object map). The array
  is what 2.x actually reads; the map is kept so one install serves both generations.
  On a stock 2.4 only the `.env` rule changes behaviour, because the default agent already
  allows everything else.
- hook `ctx.permission.hook("evaluate", p)` → `p.effect = "allow"` and `p.message = undefined`;
  catches anything the config did not cover, including permission keys added later.

`config` is not a hook in 2.x — the CLI reads `opencode.json` itself — so the config layer is
written to disk by the catalogue (AP-01 … AP-04) rather than patched in memory.

## 3. Tool descriptions

1.19 exposed `tool.definition(input = { toolID }, output = { description, parameters })`.
2.x has no such event: the catalog rides on the context payload, so the same hook rewrites
`p.tools[name].description` in place. Parameters are left untouched — changing schemas breaks
tool calls.

Tool names changed with the generation: `bash` → `shell`, `task` → `subagent`, plus `patch`
and `execute`.

## 4. Custom tools

1.19 registered tools by returning a `tool` key from the plugin function, wrapped with
`@opencode-ai/plugin`'s `tool()`. 2.x registers them inside `setup`:

```js
ctx.tool.transform((d) => {
  d.add({
    name: "purge_status",
    description: "…",
    input: EMPTY_INPUT,
    output: OUT_TEXT,        // mandatory when execute() returns { output }
    async execute() { return { output: { text: "…" } } },
  })
})
```

A tool that returns `{ output }` without declaring an `output` schema is rejected at call time
with `Tool result declared output without an output schema`; the model sees `null` and
nothing lands in `purge.log`. Both schema constants sit next to the tool definitions so they
stay in sync.

## 5. Binary constants

opencode embeds its prompt literals in the executable. Bun's `--compile` output keeps the JS
source in a blob; editing it in place is safe only at identical byte length, so replacements
are right-padded. Each write records `{ id, offset, length, orig, patched }` in
`purge/deep.json`. Revert rewrites `orig` only where the bytes still equal `patched`, which
protects against a later upgrade or a third-party edit.

The desktop build ships the CLI twice and either copy can be the one that gets spawned:

```
%LOCALAPPDATA%\Programs\ai.opencode.desktop\OpenCode.exe                 Electron shell
%LOCALAPPDATA%\Programs\ai.opencode.desktop\resources\opencode-cli.exe    copy A
%APPDATA%\ai.opencode.desktop\cli\<ver>-<arch>\opencode-cli.exe          copy B
```

`detectOpenCodeBinaries()` returns all candidates (de-duplicated, >20 MB); `deepApply()`
patches every one that still holds anchors. `OPENCODE_BIN` is a strict override — set it and
only that file is considered, which is what makes a dry run against a copy safe.

Two Windows-specific behaviours:

- **Write while running.** The image cannot be opened for writing (`EBUSY`) but can be
  renamed, because the loader holds a handle rather than a path. `writeImage()` writes a temp
  file, renames the live image aside, renames the temp into place, then tries to drop the old
  image. The running process keeps its bytes until restart; the next launch is patched.
- **Second run.** After patching, the anchors are gone, so a naive re-apply would classify
  the binary as "no anchors" and drop it from `deep.json`, losing the revert record.
  `rebuildFromBackup()` re-derives offsets from `<bin>.opencodepurge.bak` (same length, same
  positions) and only claims a window when the live bytes still equal our payload; patches
  are unioned into the existing record by offset rather than replacing it.

## Data flow of a patch run

```
bin/opencode-purge.js
   └── lib/engine.js         configure({deep, force})
        ├── catalog.installSelf()   copy package → purge/app, write launcher
        ├── catalog.PATCHES[]       ordered, independent, idempotent
        │     ├── paths.js          where things live, which binaries exist
        │     ├── fsx.js            read/write/backup/log
        │     ├── config-patch.js   opencode.json snapshot → edit → exact restore
        │     └── deep.js           exe constants, per copy
        └── purge/manifest.json     record of the run
```

## Failure modes

| Situation | Behaviour |
| --- | --- |
| plugin exported in 1.19 shape | rejected at load; no log, no hooks — `npm test` catches it |
| `opencode.json` has comments (JSONC) | `JSON.parse` throws → AP-01 reports `skipped`, other layers still install |
| plugin file edited by the user | `backupOnce` keeps the original; `revert` restores it |
| frame edited by the user | hash mismatch → `frame kept (user edited)` |
| binary in use | `writeImage()` swaps via rename; reports `(swapped; restart to take effect)` |
| second `apply --deep` | `rebuildFromBackup()` re-derives offsets; reports `(already patched)` |
| opencode upgraded | deep offsets no longer match → anchors missing → `skipped`, no partial writes |
| host identity wording changed | `strip` matches nothing → `dropped=0`; add the new anchor |
| tool returns `{output}` without schema | host rejects the call, model sees `null` |

## Why not just patch the binary?

Because plugin hooks are supported extension points: they survive upgrades, need no
elevation, and are inspectable. The binary layer exists for the case where the host prompt
must be changed even with plugins disabled (`opencode --pure`), and for setups where an
approval-layer hook is not reached. Both layers are independent; either can be reverted
without touching the other.
