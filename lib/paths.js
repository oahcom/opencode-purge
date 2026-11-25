// Filesystem layout and host detection.
// All paths derive from a single HOME so tests can point at a throwaway config dir.

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

/** Package root — prompt/, plugin/, skills/, lib/ live here. */
export const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** opencode config dir. Override with OPENCODE_PURGE_HOME or OPENCODE_CONFIG_DIR. */
export const HOME =
  process.env.OPENCODE_PURGE_HOME ||
  process.env.OPENCODE_CONFIG_DIR ||
  path.join(os.homedir(), ".config", "opencode")

/** Working directory created inside the config dir. */
export const PURGE = path.join(HOME, "purge")
export const APP_DIR = path.join(PURGE, "app")
export const LAUNCHER = path.join(PURGE, "opencode-purge.mjs")
export const FRAME = path.join(PURGE, "prompt-inject.md")
export const FRAME_MARKER = path.join(PURGE, ".frame.sha256")
export const POLICY = path.join(PURGE, "policy.json")
export const ALLOW = path.join(PURGE, "net-scope-allow.txt")
export const MANIFEST = path.join(PURGE, "manifest.json")
export const DEEP = path.join(PURGE, "deep.json")
export const PRIOR = path.join(PURGE, "config-prior.json")
export const LOG = path.join(PURGE, "purge.log")

export const PLUGIN_DIR = path.join(HOME, "plugins")
export const PLUGIN_TARGET = path.join(PLUGIN_DIR, "opencode-purge.js")
export const AGENTS = path.join(HOME, "AGENTS.md")

export const MARK_BEGIN = "<!-- opencode-purge:begin -->"
export const MARK_END = "<!-- opencode-purge:end -->"

/** opencode.json / opencode.jsonc inside the config dir. */
export function findConfig() {
  for (const name of ["opencode.json", "opencode.jsonc"]) {
    const p = path.join(HOME, name)
    if (fs.existsSync(p)) return p
  }
  return path.join(HOME, "opencode.json")
}

/**
 * Every file the desktop build may execute, in preference order.
 *
 * The desktop app is an Electron shell (OpenCode.exe) plus a Bun-compiled CLI
 * (opencode-cli.exe). Only the CLI carries the prompt constants, and the app
 * ships two identical copies of it — one under resources/, one per downloaded
 * version under Roaming/cli/<version>-<arch>/. Either copy can be the one that
 * gets spawned, so all of them are candidates and the deep layer patches every
 * copy that actually contains the anchors.
 */
function desktopBinaries() {
  const out = []
  const roaming = path.join(os.homedir(), "AppData", "Roaming", "ai.opencode.desktop")
  const local = path.join(os.homedir(), "AppData", "Local", "Programs", "ai.opencode.desktop")

  const cliRoot = path.join(roaming, "cli")
  try {
    for (const dir of fs.readdirSync(cliRoot)) {
      out.push(path.join(cliRoot, dir, "opencode-cli.exe"))
    }
  } catch {
    /* no downloaded CLI */
  }

  out.push(path.join(local, "resources", "opencode-cli.exe"))
  out.push(path.join(local, "opencode-cli.exe"))
  out.push(path.join(local, "OpenCode.exe"))
  return out
}

/** All candidate opencode binaries on this machine, de-duplicated. */
export function detectOpenCodeBinaries() {
  // An explicit override means exactly that binary — no autodetection, so a
  // dry run against a copy never touches the live install.
  if (process.env.OPENCODE_BIN) {
    try {
      const p = path.resolve(process.env.OPENCODE_BIN)
      return fs.statSync(p).isFile() ? [p] : []
    } catch {
      return []
    }
  }

  const candidates = [
    path.join(path.dirname(process.execPath), "opencode.exe"),
    path.join(path.dirname(process.execPath), "opencode-cli.exe"),
    path.join(os.homedir(), "AppData", "Roaming", "npm", "node_modules", "opencode-ai", "bin", "opencode.exe"),
    "/usr/local/bin/opencode",
    "/opt/homebrew/bin/opencode",
    path.join(os.homedir(), ".opencode", "bin", "opencode"),
    ...desktopBinaries(),
  ].filter(Boolean)

  const seen = new Set()
  const found = []
  for (const c of candidates) {
    const key = path.resolve(c).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    try {
      const st = fs.statSync(c)
      if (st.isFile() && st.size > 20 * 1024 * 1024) found.push(path.resolve(c))
    } catch {
      /* keep looking */
    }
  }
  return found
}

/** First candidate, for status display. */
export function detectOpenCodeBinary() {
  return detectOpenCodeBinaries()[0] || ""
}

/** True when an opencode process holds a binary. */
export function runningOpenCode() {
  try {
    const { spawnSync } = require("node:child_process")
    if (process.platform === "win32") {
      // The desktop build runs as OpenCode.exe (Electron) and opencode-cli.exe
      // (Bun server); either one keeps its image locked on disk.
      const r = spawnSync("tasklist", ["/FO", "CSV", "/NH"], { encoding: "utf8" })
      return /"(OpenCode|opencode-cli|opencode)\.exe","\d+"/i.test(r.stdout || "")
    }
    return spawnSync("pgrep", ["-x", "opencode"], { encoding: "utf8" }).status === 0
  } catch {
    return false
  }
}
