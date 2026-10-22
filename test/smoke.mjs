// Smoke test: install into a throwaway config dir, assert the expected layout,
// then revert and assert the config file comes back byte-identical.
//
//   node test/smoke.mjs
//
// No network, no opencode process needed; the deep layer stays off.

import { spawnSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cli = path.join(root, "bin", "opencode-purge.js")
const home = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-purge-test-"))

const seed = {
  $schema: "https://opencode.ai/config.json",
  provider: { test: { models: { m: { name: "M" } }, npm: "@ai-sdk/openai-compatible" } },
  mcp: {},
}
const configPath = path.join(home, "opencode.json")
fs.writeFileSync(configPath, JSON.stringify(seed, null, 2), "utf8")
const before = crypto.createHash("sha256").update(fs.readFileSync(configPath)).digest("hex")

const run = (args) =>
  spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, OPENCODE_PURGE_HOME: home, NO_COLOR: "1" },
  })

let failures = 0
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`)
  if (!ok) failures++
}

const applied = run(["apply"])
check("apply exits 0", applied.status === 0)
check("apply reports no failure", !/✗/.test(applied.stdout))
check("frame installed", fs.existsSync(path.join(home, "purge", "prompt-inject.md")))
check("plugin installed", fs.existsSync(path.join(home, "plugins", "opencode-purge.js")))
check("launcher installed", fs.existsSync(path.join(home, "purge", "opencode-purge.mjs")))
check("self copy installed", fs.existsSync(path.join(home, "purge", "app", "bin", "opencode-purge.js")))
check("policy written", fs.existsSync(path.join(home, "purge", "policy.json")))
check("agents rules written", fs.readFileSync(path.join(home, "AGENTS.md"), "utf8").includes("opencode-purge:begin"))
check("skills imported", fs.readdirSync(path.join(home, "skills")).some((d) => d.startsWith("purge-")))

const merged = JSON.parse(fs.readFileSync(configPath, "utf8"))
check("permission flattened", merged.permission?.["*"] === "allow")
check("doom_loop allowed", merged.permission?.doom_loop === "allow")
check("tool_output raised", merged.tool_output?.max_lines >= 20000)
check("purge command present", Boolean(merged.commands?.purge))
check("provider config preserved", merged.provider?.test?.models?.m?.name === "M")

const status = run(["status"])
check("status shows all applied", /0 pending/.test(status.stdout))

const reverted = run(["revert"])
check("revert exits 0", reverted.status === 0)
const after = crypto.createHash("sha256").update(fs.readFileSync(configPath)).digest("hex")
check("config restored byte-identically", before === after)
check("plugin removed", !fs.existsSync(path.join(home, "plugins", "opencode-purge.js")))
check("frame kept after revert", fs.existsSync(path.join(home, "purge", "prompt-inject.md")))
check("skills removed", !fs.readdirSync(path.join(home, "skills")).some((d) => d.startsWith("purge-")))

run(["uninstall"])
check("uninstall removes purge dir", !fs.existsSync(path.join(home, "purge")))

fs.rmSync(home, { recursive: true, force: true })
console.log(failures === 0 ? "\nsmoke test passed" : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
