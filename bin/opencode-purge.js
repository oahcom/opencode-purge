#!/usr/bin/env node
/**
 * opencode-purge — armour-breaking layer for opencode.
 *
 * Ported from dsh-purge (https://github.com/YuJunZhiXue/dsh-purge, MIT).
 * Flattens the host prompt, the approval gates and the tool descriptions, then
 * keeps status / apply / revert / uninstall working like the original plugin.
 *
 * Target: ~/.config/opencode (override with OPENCODE_CONFIG_DIR or OPENCODE_PURGE_HOME).
 */

import fs from "node:fs"

import { HOME, FRAME, POLICY, PLUGIN_TARGET, PURGE, LAUNCHER, detectOpenCodeBinary, findConfig } from "../lib/paths.js"
import { read } from "../lib/fsx.js"
import { c } from "../lib/ui.js"
import { configure, runApply, runRevert, status, uninstall, usage, deepApply, deepRevert } from "../lib/engine.js"

const argv = process.argv.slice(2)
const cmd = (argv[0] || "status").toLowerCase()
const has = (name) => argv.includes(`--${name}`)

configure({ deep: has("deep"), force: has("force") })

function printApply() {
  const results = runApply()
  const failed = results.filter((r) => !r.ok)
  console.log(`已应用 ${results.length - failed.length}/${results.length} 层 -> ${HOME}\n`)
  for (const r of results) {
    console.log(`  ${r.ok ? c.ok("✓") : c.err("✗")} ${r.id.padEnd(6)} ${r.title}\n     ${c.dim(r.note)}`)
  }
  console.log(`\n${c.b("下一步")}：重开 opencode 会话（新会话才会加载插件与新系统提示词）。`)
  console.log(c.dim("注入段改动无需重启；policy.json 改动需要新会话。"))
  if (failed.length) console.log(c.warn(`有 ${failed.length} 层失败，见上方 ✗ 行。`))
}

function printRevert() {
  const results = runRevert()
  console.log(`已还原 ${results.length} 层。`)
  for (const r of results) console.log(`  ${c.dim("·")} ${r.id.padEnd(6)} ${r.note}`)
}

try {
  switch (cmd) {
    case "status":
    case "s":
      console.log(status())
      break

    case "apply":
    case "a":
      printApply()
      break

    case "revert":
    case "r":
      printRevert()
      break

    case "uninstall":
      uninstall()
      console.log(`已卸载：插件、注入层与 purge/ 工作目录（${PURGE}）。`)
      break

    case "edit":
      if (!fs.existsSync(FRAME)) console.log(`注入段不存在，先跑 apply：${FRAME}`)
      else console.log(`${FRAME}\n\n${read(FRAME)}`)
      break

    case "where":
      console.log(
        [
          `config dir : ${HOME}`,
          `purge dir  : ${PURGE}`,
          `plugin     : ${PLUGIN_TARGET}`,
          `launcher   : ${LAUNCHER}`,
          `frame      : ${FRAME}`,
          `policy     : ${POLICY}`,
          `config     : ${findConfig()}`,
          `binary     : ${detectOpenCodeBinary() || "(not found)"}`,
        ].join("\n"),
      )
      break

    case "deep":
      console.log(has("revert") ? deepRevert() : deepApply({ force: has("force") }))
      break

    default:
      console.log(usage())
  }
} catch (e) {
  console.error(c.err(`opencode-purge: ${e?.message ?? e}`))
  process.exitCode = 1
}
