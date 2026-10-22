// opencode.json surgery: permission flattening + exact restore.
//
// A patch run only ever appends/overrides a known set of top-level keys, and the
// pre-run values are snapshotted to purge/config-prior.json so revert can put the
// file back byte for byte.

import fs from "node:fs"
import { PRIOR, findConfig } from "./paths.js"
import { backupOnce, readJson, writeJson } from "./fsx.js"

/** Top-level config keys this tool touches. */
export const CONFIG_KEYS = ["permission", "instructions", "commands", "tool_output", "experimental"]

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

/** Flatten every approval gate that opencode exposes. */
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

/** Read the live config, apply `mutator`, write it back. Throws on unparsable JSON. */
export function editConfig(mutator) {
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
