// opencode.json surgery: permission flattening + exact restore.
//
// A patch run only ever appends/overrides a known set of top-level keys, and the
// pre-run values are snapshotted to purge/config-prior.json so revert can put the
// file back byte for byte.

import fs from "node:fs"
import { PRIOR, findConfig } from "./paths.js"
import { backupOnce, readJson, writeJson } from "./fsx.js"

/** Top-level config keys this tool touches. */
export const CONFIG_KEYS = ["permission", "permissions", "instructions", "commands", "tool_output", "experimental"]

export function snapshotConfigKeys(cfg) {
  const before = {}
  const had = []
  for (const k of CONFIG_KEYS) {
    if (k in cfg) {
      before[k] = cfg[k]
      had.push(k)
    }
  }
  return { before, had }
}

/** 1.19 only: `permission` was an object map. 2.x ignores this key entirely. */
export function mergePerm(p) {
  const base = typeof p === "object" && p !== null ? { ...p } : {}
  return {
    ...base,
    "*": "allow",
    external_directory: "allow",
    doom_loop: "allow",
    read: {
      ...(base.read || {}),
      "*": "allow",
      "*.env": "allow",
      "*.env.*": "allow",
      "*.env.example": "allow",
    },
  }
}

/**
 * 2.x permissions: an ordered array of `{ action, resource, effect }`.
 *
 * The host resolves a check with `rules.findLast(match)` — the LAST matching
 * rule wins — and concatenates config rules with the agent's own defaults
 * (`(...).flat()`, no override). The stock default already allows everything on
 * every resource and only asks for `read *.env*`, so our rules must go at the END
 * to take effect.
 *
 * `action` may be `"*"`, `"read"`, `"edit"`, `"execute"`, `"external_directory"`,
 * `"doom_loop"`, … `resource` is a glob on the tool's target.
 *
 * Measured on 2.4.1: the stock agent already allows everything, so only the
 * `read *.env*` rules change behaviour (`ask` -> `allow`). The rest are written
 * so a user who tightened the defaults still gets a flat gate.
 */
export function mergePermissions(current) {
  const base = Array.isArray(current) ? current.filter(isRule) : []
  const want = [
    { action: "*", resource: "*", effect: "allow" },
    { action: "external_directory", resource: "*", effect: "allow" },
    { action: "doom_loop", resource: "*", effect: "allow" },
    { action: "read", resource: "*.env", effect: "allow" },
    { action: "read", resource: "*.env.*", effect: "allow" },
  ]
  // Drop anything the user already has at the same (action, resource) so the
  // array does not grow on repeated applies; ours then wins because it is last.
  const seen = new Set(want.map((r) => `${r.action}\u0000${r.resource}`))
  const kept = base.filter((r) => !seen.has(`${r.action}\u0000${r.resource}`))
  return [...kept, ...want]
}

function isRule(r) {
  return r && typeof r === "object" && typeof r.action === "string" && typeof r.resource === "string" && typeof r.effect === "string"
}

/** True when `rules` already carries every rule mergePermissions would add. */
export function hasFlatPermissions(rules) {
  if (!Array.isArray(rules)) return false
  const last = (action, resource) => {
    for (let i = rules.length - 1; i >= 0; i--) {
      const r = rules[i]
      if (r && r.action === action && r.resource === resource) return r.effect
    }
    return undefined
  }
  return (
    last("*", "*") === "allow" &&
    last("external_directory", "*") === "allow" &&
    last("doom_loop", "*") === "allow" &&
    last("read", "*.env") === "allow" &&
    last("read", "*.env.*") === "allow"
  )
}

/** Read the live config, apply `mutator`, write it back. Throws on unparsable JSON. */export function editConfig(mutator) {
  const file = findConfig()
  backupOnce(file)
  const cfg = readJson(file, {})
  if (!cfg) throw new Error(`cannot parse ${file}`)
  if (!fs.existsSync(PRIOR)) writeJson(PRIOR, { file, ...snapshotConfigKeys(cfg) })
  mutator(cfg)
  writeJson(file, cfg)
  return file
}

/** Undo every config change recorded in config-prior.json. */
export function restoreConfig() {
  const prior = readJson(PRIOR, null)
  if (!prior) return false

  const cfg = readJson(prior.file, null)
  if (!cfg) return false

  const had = prior.had || []
  for (const k of CONFIG_KEYS) {
    if (had.includes(k)) cfg[k] = prior.before[k]
    else delete cfg[k]
  }
  writeJson(prior.file, cfg)

  // Match the backup's trailing newline so the file is byte-identical after revert.
  const bak = `${prior.file}.opencodepurge.bak`
  if (fs.existsSync(bak)) {
    const bakText = fs.readFileSync(bak, "utf8")
    const cur = fs.readFileSync(prior.file, "utf8")
    if (!bakText.endsWith("\n") && cur.endsWith("\n")) {
      fs.writeFileSync(prior.file, cur.replace(/\n$/, ""), "utf8")
    }
    fs.rmSync(bak)
  }
  fs.rmSync(PRIOR)
  return true
}
