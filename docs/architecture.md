# Architecture

opencode has three seams that shape what the model sees. This tool attaches at all three,
plus an optional fourth that lives in the executable itself.

```
                       ┌──────────────────────────────┐
  user message ───────▶│ opencode session             │
                       │                              │
                       │  1. system prompt assembly   │◀── plugin hook
                       │     (base + env + skills +   │    experimental.chat.system.transform
                       │      mcp + AGENTS.md)        │
                       │                              │
                       │  2. LLM request (tools)      │◀── plugin hook tool.definition
                       │                              │◀── config permission
                       │  3. tool call                │◀── plugin hook permission.ask
                       │                              │
                       └──────────────┬───────────────┘
                                      │
                            opencode.exe (Bun single-file)
                                      ▲
                                      │ equal-length rewrite
                            --deep (optional, offline)
```

## 1. Prompt assembly

`LLMRequestPrep.prepare` builds:

```
[ agent.prompt ?? providerPrompt(model), ...system, user.system ].filter(Boolean).join("\n")
```

and hands the resulting array to plugins:

```js
await plugin.trigger("experimental.chat.system.transform", { sessionID, model }, { system })
```

The array normally holds one joined string. The plugin rewrites it:

- `strip` (default) — find the first of `You are powered by the model named`,
  `Here is some useful information…`, `<env>` and keep everything from there; prepend the
  frame. Provider prompt gone, env/skills/mcp/AGENTS preserved.
- `strict` — frame plus the `<env>` block only.
- `always` — append the frame after the untouched host prompt.

Because the provider prompt is the only part being dropped, tool schemas, skill index and
project rules keep working.

## 2. Approval gates

Two independent switches:

- `opencode.json` → `permission` (`*`, `external_directory`, `doom_loop`, `.env` reads) set
  to `allow`; this is what the runtime consults before prompting.
- hook `permission.ask(input, output)` → `output.status = "allow"`; catches anything the
  config did not cover, including future permission keys.

`config` hook additionally forces `permission["*"] = "allow"` on the loaded config object,
so a project-level `opencode.json` cannot re-tighten it for the session.

## 3. Tool descriptions

`tool.definition(input = { toolID }, output = { description, parameters })` appends one
neutral paragraph per tool. The parameters are left untouched — changing schemas breaks
tool calls.

## 4. Binary constants

opencode 1.19 embeds six prompt literals. Bun's `--compile` output keeps the JS source in a
blob; editing it in place is safe only at identical byte length, so replacements are
right-padded. Each write records `{ id, offset, length, orig, patched }` in
`purge/deep.json`. Revert rewrites `orig` only where the bytes still equal `patched`,
which protects against a later upgrade or a third-party edit.

## Data flow of a patch run

```
bin/opencode-purge.js
   └── lib/engine.js         configure({deep, force})
        ├── catalog.installSelf()   copy package → purge/app, write launcher
        ├── catalog.PATCHES[]       ordered, independent, idempotent
        │     ├── paths.js          where things live
        │     ├── fsx.js            read/write/backup/log
        │     ├── config-patch.js   opencode.json snapshot → edit → exact restore
        │     └── deep.js           exe constants
        └── purge/manifest.json     record of the run
```

## Failure modes

| Situation | Behaviour |
| --- | --- |
| `opencode.json` has comments (JSONC) | `JSON.parse` throws → AP-01 reports `skipped`, other layers still install |
| plugin file edited by the user | `backupOnce` keeps the original; `revert` restores it |
| frame edited by the user | hash mismatch → `frame kept (user edited)` |
| opencode running | deep layer refuses; everything else applies |
| opencode upgraded | deep offsets no longer match → anchors missing → `skipped`, no partial writes |
| host prompt wording changed | `strip` falls back to `<env>` marker; if absent, frame is prepended and host prompt kept |

## Why not just patch the binary?

Because plugin hooks are supported extension points: they survive upgrades, need no
elevation, and are inspectable. The binary layer exists for the case where the host prompt
must be changed even with plugins disabled (`opencode --pure`), and for setups where an
approval-layer hook is not reached. Both layers are independent; either can be reverted
without touching the other.
