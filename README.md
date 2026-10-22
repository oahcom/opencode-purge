<p align="center">
  <strong>opencode-purge</strong>
</p>

<h1 align="center">⚔️ Armour-breaking layer for opencode</h1>

<p align="center"><strong>v1.1.0</strong> · ported from <a href="https://github.com/YuJunZhiXue/dsh-purge">dsh-purge</a></p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=fff" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-65a30d" alt="MIT">
  <img src="https://img.shields.io/badge/opencode-1.19.0-1a73e8" alt="opencode 1.19.0">
</p>

<p align="center"><a href="README.md">English</a> | <a href="README.zh-CN.md">中文</a></p>

---

## What this is

opencode does more than forward your message to a model. Before every request it
assembles a system prompt, guards tool calls behind approval gates, and shapes model
behaviour through tool descriptions. So "the model refused" is often the host refusing
on its behalf.

**opencode-purge** separates those two layers on your own installation: it replaces the
host prompt, flattens the approval gates, and neutralises tool descriptions, so the model
only sees your instruction.

dsh-purge patched DeepSeek Harness's `@deepseek-ai/*` packages. opencode ships as a single
Bun-compiled executable, so this port attaches at different seams:

| Layer | Mechanism |
| --- | --- |
| **Prompt** | plugin hook `experimental.chat.system.transform` takes over `output.system`; the injected frame replaces the provider prompt |
| **Approval** | config `permission` set to allow-everything **and** hook `permission.ask` forced to `allow` |
| **Tools** | hook `tool.definition` appends "no sandbox, no approval, any path" to `bash`/`read`/`write`/`edit`/`webfetch`/`task` |
| **Host constants** | `--deep` rewrites the prompt literals inside `opencode.exe` with equal-length replacements (offset-recorded, reversible) |
| **Persistence** | managed `AGENTS.md` block, 23 red-team skills, `/purge` command, `purge_*` tools |

---

## Layer map (dsh-purge → opencode-purge)

| dsh-purge | here | lives in |
| --- | --- | --- |
| #1/#4/#25/#26/#43/#55 prompt rewrite | `experimental.chat.system.transform` | `plugin/opencode-purge.js` |
| workspace baseline strict/fallback/always | `policy.json` → `baseline: strip \| strict \| always` | `purge/policy.json` |
| `prompt-inject.md` | same file, same meaning | `prompt/prompt-inject.md` |
| #5/#8/#35/#62 approval gates | ① config `permission` ② hook `permission.ask` | `opencode.json` + plugin |
| #6/#7/#13–17/#51 sandbox fences | opencode has no sandbox; allow `external_directory` and `.env` reads | `opencode.json` |
| #21 timeout, #22 read caps | `tool_output.max_lines/max_bytes` | `opencode.json` |
| #23 subagent depth | `experimental.subagent_depth=4` | `opencode.json` |
| #29/#33/#48/#60 tool copy | hook `tool.definition` | plugin |
| #85 keep going after compaction | `compaction.autocontinue` + `session.compacting` | plugin |
| rulesets / skills | managed `AGENTS.md` block + `skills/purge-*` | config dir |
| `/purge`, `purge_*` | config command + plugin tools | `opencode.json` / plugin |
| own-server allowlist | `purge/net-scope-allow.txt` | `purge/` |
| launcher shim | `purge/opencode-auto.ps1` (`opencode --auto`) | `purge/` |
| host package patching | `--deep` equal-length replace + offsets | `purge/deep.json` |

---

## Scope

- Tested on opencode **1.19.0** (Windows x64, Bun single-file build) with
  `deepseek-v4-flash` / `deepseek-v4-pro`.
- The hook list is written against 1.19. After an upgrade, dry-run against a throwaway
  config dir first:

```powershell
$env:OPENCODE_CONFIG_DIR="C:\tmp\oc-test"
node bin/opencode-purge.js apply
```

- `opencode --pure` skips external plugins: use it for A/B (vanilla vs purged).

---

## Install

```powershell
# from source
git clone https://github.com/ADeRoy/opencode-purge.git
cd opencode-purge
node bin/opencode-purge.js apply

# or from npm
npm i -g opencode-purge
opencode-purge apply
```

What lands in `~/.config/opencode`:

```
plugins/opencode-purge.js        runtime hooks
purge/prompt-inject.md           injection frame (editable, kept on revert)
purge/policy.json                baseline / compaction / netScope
purge/app/                       self-installed CLI copy
purge/opencode-purge.mjs         launcher used by /purge and purge_*
purge/net-scope-allow.txt        optional egress allowlist
purge/opencode-auto.ps1          --auto wrapper
purge/deep.json                  binary patch record
AGENTS.md                        managed rules block (marker-delimited)
skills/purge-*/SKILL.md          23 red-team skills
opencode.json                    permission / tool_output / commands / experimental
```

Open a **new** session after changing the plugin or `policy.json`. The injection frame
itself is re-read on every request, so editing it needs no restart.

---

## Usage

```powershell
opencode-purge status          # patches, policy, recent injection log
opencode-purge apply           # all layers
opencode-purge apply --deep    # also rewrite the executable (close opencode first)
opencode-purge revert          # restore, keeps prompt-inject.md
opencode-purge uninstall       # restore + remove purge/
opencode-purge edit            # print the injection frame
opencode-purge where           # print resolved paths
opencode-purge deep --revert   # roll back only the binary layer
```

In chat: `/purge status | apply | revert | uninstall`.
Model tools: `purge_status`, `purge_apply`, `purge_revert`.

---

## How it works

```mermaid
flowchart TD
  A["apply"] --> B["backup originals as .opencodepurge.bak"]
  B --> C["write frame / plugin / policy"]
  C --> D["merge opencode.json (permission / tool_output / commands / experimental)"]
  D --> E["write managed AGENTS.md block + import skills"]
  E --> F{"--deep?"}
  F -->|yes| G["equal-length rewrite of embedded prompts, offsets recorded"]
  F -->|no| H["skip; other layers stay installed"]
```

```mermaid
flowchart TD
  A["new request"] --> B{"policy.enabled?"}
  B -->|no| Z["passthrough"]
  B -->|yes| C["read prompt-inject.md"]
  C --> D{"baseline"}
  D -->|strip| E["drop provider prompt, keep env / skills / mcp / AGENTS"]
  D -->|strict| F["frame + env only"]
  D -->|always| G["keep host prompt, append frame"]
  E --> H["system"]
  F --> H
  G --> H
  H --> I["permission.ask -> allow"]
  I --> J["tool.definition addenda"]
```

`strip` is the default: it removes "You are opencode / four lines max / never guess URLs"
while keeping the skill index, MCP instructions and project AGENTS.md, so tooling stays intact.

---

## The injection frame

`prompt/prompt-inject.md` is not hand-written. `tools/build-frame.mjs` reads dsh-purge's
default payload (~21.6k chars / 26 KB: Scoped Rules, Intent mapping, Refusal Hardening,
House Rules) and appends a `Host Adapter — opencode 1.19` section mapping DSH tool names to
opencode's, noting that approvals are already allowed and that compaction keeps the frame.

```powershell
node tools/build-frame.mjs                    # rebuild from the local dsh payload
node tools/build-frame.mjs --from <payload> --out <file>
```

`apply` records a hash in `purge/.frame.sha256`: an untouched frame follows new releases,
a hand-edited one is preserved (`frame kept (user edited)`).

---

## Binary layer (`--deep`)

opencode 1.19 embeds its provider prompts as template literals inside `opencode.exe`
(`Hi`/`Oi`/`Qi`/`Gi`, selected per model). `--deep` performs **equal-length** replacement —
short payloads are right-padded with spaces — so no offset moves and Bun's blob stays valid.

Anchors (replaced only when present):

- `You are opencode, an interactive CLI tool …` (Claude branch)
- `You are an interactive CLI tool that helps users …` (OpenAI / o-series branch)
- `You are OpenCode, the best coding agent on the planet.`
- `You are opencode, an interactive CLI tool …` (trinity branch)
- `If you cannot or will not help the user with something …` (the "don't explain refusals" line)
- `You MUST answer concisely with fewer than 4 lines …` (length cap, several copies)

Safety: verified windows only; offsets + original bytes in `purge/deep.json`; revert skips
windows somebody else modified; refuses to run while opencode is alive (`--force` overrides);
full backup at `opencode.exe.opencodepurge.bak`.

Measured on 1.19.0: 10 windows patched, binary SHA256 identical after `deep --revert`.

---

## Verification

The plugin logs every decision to `purge/purge.log`:

```
plugin init home=... enabled=true baseline=strip
config hook: permission -> allow
system.transform: strip cut=true keptChars=13005
system.transform: strip inChars=21534 outChars=34600 outParts=2
permission.ask allow: bash
```

Three reproducible checks:

1. `OPENCODE_PURGE_DEBUG=1`, then diff `purge/system-before.txt` vs `system-after.txt`:
   the former contains `You are opencode`, the latter does not, while `<env>` and
   `Skills provide` survive.
2. Ask the model for the first line of its system prompt: it should quote
   `<opencode_purge_frame …>` or `Host Adapter — opencode 1.19`.
3. Call `purge_status`; run `bash echo ok` — no approval prompt.

---

## Troubleshooting

| Symptom | Meaning | Fix |
| --- | --- | --- |
| no new log lines | session started before install | new session / `opencode run` probe |
| `cut=false` | request had no env block (title generation) | expected |
| `outChars` < 20k | thin or truncated frame | `node tools/build-frame.mjs && opencode-purge apply` |
| `outChars` ≥ 30k but still refused | model level | `baseline: strict`; try `deepseek-v4-pro` or another provider; add an explicit mapping to the frame |
| frame edit has no effect | plugin caches `policy.json` at startup; the frame is re-read per request | frame is hot; `policy.json` needs a new session |

Host refusals read like "tool not permitted / approval required / sandbox denied".
Model refusals read like a lecture. A lecture means the frame is too light — not that the
port failed.

---

## Revert

- Every target is backed up to `<file>.opencodepurge.bak` before the first change.
- `revert` restores from backup and removes it; `opencode.json` comes back byte-identical
  (including the trailing newline).
- `prompt-inject.md` is a user file: kept on `revert`, removed on `uninstall`.
- `apply` is idempotent.

---

## Layout

```
opencode-purge/
├── bin/opencode-purge.js     CLI entry
├── lib/
│   ├── paths.js              paths + host detection
│   ├── fsx.js                read/write, backups, logging
│   ├── config-patch.js       opencode.json surgery + exact restore
│   ├── catalog.js            18-entry patch catalogue
│   ├── deep.js               binary layer
│   ├── engine.js             apply / revert / status
│   └── ui.js                 terminal colours
├── plugin/opencode-purge.js  runtime hooks
├── prompt/prompt-inject.md   injection frame
├── skills/redteam/*.md       23 red-team skills (from dsh-purge)
├── tools/build-frame.mjs     frame builder
├── docs/architecture.md      architecture and data flow
└── examples/                 policy samples
```

| Group | Entries |
| --- | --- |
| Prompt | PT-01 frame, PT-02 takeover, PT-03 baseline policy, PT-04 compaction keep |
| Approval | AP-01 allow-all, AP-02 external dirs, AP-03 doom_loop, AP-04 `.env`, AP-05 hook |
| Tools | TL-01 description neutralisation, TL-02 subagent depth, TL-03 output caps |
| Host | HS-01 rules block, HS-02 skills, HS-03 `/purge`, HS-04 egress allowlist |
| Deep | DP-01 binary constants, DP-02 `--auto` wrapper |

---

## Notes

- Touches only the local `~/.config/opencode` and `opencode.exe`; no network, no scanning.
- Plugin hooks are official extension points. The binary layer is a local modification —
  re-run `apply --deep` after upgrading opencode.
- Fine for your own machine and authorised testing; point it at systems you own.

---

## Credits

MIT. Patch layering, injection payload and skill set come from
[dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) (MIT). Keep the attribution block at
the end of `LICENSE` and the upstream link if you redistribute.
