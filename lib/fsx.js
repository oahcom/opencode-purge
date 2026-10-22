// Small filesystem helpers shared by the patch catalogue.

import fs from "node:fs"
import path from "node:path"
import { LOG, PURGE } from "./paths.js"

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

export function read(file, dflt = "") {
  try {
    return fs.readFileSync(file, "utf8")
  } catch {
    return dflt
  }
}

export function readJson(file, dflt = null) {
  const raw = read(file)
  if (!raw.trim()) return dflt
  return JSON.parse(raw)
}

export function writeJson(file, obj) {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`, "utf8")
}

export function copy(src, dst) {
  ensureDir(path.dirname(dst))
  fs.copyFileSync(src, dst)
}

/** Backup a file once per installation (`<file>.opencodepurge.bak`). */
export function backupOnce(target) {
  const bak = `${target}.opencodepurge.bak`
  if (!fs.existsSync(target)) return { existed: false, bak }
  if (!fs.existsSync(bak)) fs.copyFileSync(target, bak)
  return { existed: true, bak }
}

/** Restore from backup if any, otherwise delete the installed file. */
export function restoreOrRemove(target) {
  if (!fs.existsSync(target)) return
  const bak = `${target}.opencodepurge.bak`
  if (fs.existsSync(bak)) {
    fs.copyFileSync(bak, target)
    fs.rmSync(bak)
  } else {
    fs.rmSync(target)
  }
}

export function appendLog(line) {
  try {
    ensureDir(PURGE)
    fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    /* logging must never break a patch run */
  }
}

export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Rewrite the `name:` field of a SKILL.md front matter block. */
export function patchFrontmatter(body, name) {
  const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return `---\nname: ${name}\ndescription: ${name}\n---\n\n${body}`
  let fm = m[1]
  fm = /^name:/m.test(fm) ? fm.replace(/^name:.*$/m, `name: ${name}`) : `name: ${name}\n${fm}`
  return `---\n${fm}\n---\n${body.slice(m[0].length)}`
}
