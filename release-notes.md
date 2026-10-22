# Release notes

## 1.1.0

首个可开源版本：把 dsh-purge 的破甲能力落到 opencode 1.19。

**提示词层**

- 插件钩子 `experimental.chat.system.transform` 接管 `output.system`
- 三种覆盖策略：`strip`（默认，丢供应商基础提示词、留 env/skills/mcp/AGENTS）、`strict`、`always`
- 注入段改由 `tools/build-frame.mjs` 从 dsh-purge 默认负载生成（约 26 KB，含 Scoped Rules / Intent mapping / Refusal Hardening），末尾追加 opencode 工具映射
- 注入段热更新：插件每轮重读，`apply` 用哈希判断是否被手改

**审批层**

- 配置 `permission`：`*` / `external_directory` / `doom_loop` / `.env` 全放行
- 钩子 `permission.ask` 强制 `allow`，`config` 钩子再兜一层
- `opencode.json` 改动有前置快照，`revert` 逐字节还原

**工具层**

- 钩子 `tool.definition` 给 `bash`/`read`/`write`/`edit`/`webfetch`/`websearch`/`task` 追加中立化说明
- `tool_output` 上限抬到 20k 行 / 2 MB，`experimental.subagent_depth=4`

**宿主层**

- `AGENTS.md` 托管规则块（marker 包裹，可整块回滚）
- 23 个红队技能导入为 `skills/purge-*`
- `/purge` 命令、`purge_status` / `purge_apply` / `purge_revert` 工具
- `purge/opencode-auto.ps1`（`opencode --auto` 包装）
- `purge/net-scope-allow.txt` 出口白名单（默认关闭）

**二进制层（可选）**

- 6 个锚点、实测命中 10 个窗口，等长替换，偏移与原始字节落盘
- `deep --revert` 后二进制 SHA256 与原件一致
- 运行中的 opencode 会拒绝执行；`--force` 可越

**工程**

- 拆成 `lib/{paths,fsx,config-patch,catalog,deep,engine,ui}.js`，`bin` 只做分发
- `apply` 自安装整包到 `purge/app`，`/purge` 与模型工具在任意 cwd 可用
- `npm run check` 静态检查全部模块

**已知边界**

- 只在 opencode 1.19.0 + Windows x64 上验证过；其他版本先拿 `OPENCODE_CONFIG_DIR` 试
- `opencode.jsonc`（带注释）无法解析时 AP-01 会跳过，需先转成纯 JSON
- 升级 opencode 后二进制层失效，重跑 `apply --deep`
