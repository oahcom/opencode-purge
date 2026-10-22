// Patch engine: apply everything, revert everything, report state.

import fs from "node:fs"
import path from "node:path"

import {
  DEEP,
  FRAME,
  HOME,
  LAUNCHER,
  LOG,
  MANIFEST,
  PLUGIN_DIR,
  PLUGIN_TARGET,
  POLICY,
  PRIOR,
  PURGE,
  detectOpenCodeBinary,
  findConfig,
} from "./paths.js"
import { ensureDir, read, readJson, writeJson } from "./fsx.js"
import { PATCHES, installSelf } from "./catalog.js"
import { deepApply, deepRevert } from "./deep.js"
import { c } from "./ui.js"

const opts = { deep: false, force: false }

export function configure(options) {
  Object.assign(opts, options)
}

export function runApply() {
  ensureDir(PURGE)
  ensureDir(PLUGIN_DIR)

  const results = []
  try {
    const installed = installSelf()
    results.push({ id: "SELF", title: "CLI 自安装副本", ok: true, note: installed ? "purge/app" : "already installed" })
  } catch (e) {
    results.push({ id: "SELF", title: "CLI 自安装副本", ok: false, note: e?.message ?? String(e) })
  }

  for (const patch of PATCHES) {
    try {
      const note = patch.apply({ deep: opts.deep, force: opts.force })
      results.push({ id: patch.id, title: patch.title, ok: true, note: note || "" })
    } catch (e) {
      results.push({ id: patch.id, title: patch.title, ok: false, note: e?.message ?? String(e) })
    }
  }

  writeJson(MANIFEST, {
    version: 1,
    at: new Date().toISOString(),
    home: HOME,
    config: findConfig(),
    deep: opts.deep,
    items: results.map((r) => ({ id: r.id, ok: r.ok })),
  })
  return results
}

export function runRevert({ all = false } = {}) {
  const out = []
  for (const patch of [...PATCHES].reverse()) {
    try {
      out.push({ id: patch.id, note: patch.revert() || "" })
    } catch (e) {
      out.push({ id: patch.id, note: `error: ${e?.message ?? e}` })
    }
  }
  if (all) {
    for (const f of [MANIFEST, PRIOR, DEEP]) if (fs.existsSync(f)) fs.rmSync(f)
  }
  return out
}

export function uninstall() {
  runRevert({ all: true })
  if (fs.existsSync(PURGE)) fs.rmSync(PURGE, { recursive: true, force: true })
}

export function status() {
  const lines = []
  lines.push(c.b("opencode-purge 状态 / status"))
  lines.push(`· 配置目录 config : ${HOME}`)
  lines.push(`· 注入段 frame    : ${FRAME}`)
  lines.push(`· 插件 plugin     : ${PLUGIN_TARGET}`)
  lines.push(`· 配置文件 config  : ${findConfig()}`)
  lines.push(`· 可执行文件 binary: ${detectOpenCodeBinary() || "未定位"}`)
  const p = readJson(POLICY, null)
  lines.push(
    `· 覆盖策略 baseline: ${p?.baseline ?? "未安装"}  compaction=${p?.compaction ?? "-"}  netScope=${p?.netScope ?? "-"}`,
  )
  lines.push("")

  const groups = new Map()
  let applied = 0
  let pending = 0
  for (const patch of PATCHES) {
    let st
    try {
      st = patch.check()
    } catch {
      st = "skipped"
    }
    if (st === "applied") applied++
    if (st === "pending") pending++
    if (!groups.has(patch.group)) groups.set(patch.group, [])
    groups.get(patch.group).push({ patch, st })
  }

  for (const [group, items] of groups) {
    lines.push(c.b(`[${group}]`))
    for (const { patch, st } of items) {
      const icon = st === "applied" ? c.ok("✓") : st === "pending" ? c.warn("·") : c.dim("✗")
      lines.push(`  ${icon} ${patch.id.padEnd(6)} ${patch.title.padEnd(32, " ")} ${c.dim(`${patch.kind} — ${st}`)}`)
    }
    lines.push("")
  }
  lines.push(`补丁 patches: ${applied}/${PATCHES.length} applied, ${pending} pending`)

  const tail = read(LOG).trim().split(/\r?\n/).slice(-5).join("\n")
  if (tail) lines.push(`\n${c.dim("最近日志 log tail:")}\n${c.dim(tail)}`)
  return lines.join("\n")
}

export function usage() {
  return `opencode-purge <command>

  status      查看补丁、策略与最近注入日志
  apply       应用全部层（提示词 / 审批 / 工具 / 宿主）
                --deep   追加可执行文件常量替换
                --force  二进制层无视运行中的 opencode
  revert      还原全部层（保留 prompt-inject.md）
  uninstall   还原 + 删除 purge/ 与插件
  edit        打印注入段路径与内容
  where       打印探测到的路径
  deep        仅执行二进制深度层（--revert 回滚）

环境变量
  OPENCODE_CONFIG_DIR / OPENCODE_PURGE_HOME   opencode 配置目录
  OPENCODE_BIN                                指定 opencode 可执行文件
  OPENCODE_PURGE_DEBUG=1                      插件落 system-before/after.txt`
}

export { deepApply, deepRevert }
