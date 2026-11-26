<p align="center">
  <strong>opencode-purge</strong>
</p>

<h1 align="center">⚔️ opencode 破甲 / 清洗层</h1>

<p align="center"><strong>v1.2.0</strong> · 移植自 <a href="https://github.com/YuJunZhiXue/dsh-purge">dsh-purge</a></p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=fff" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-65a30d" alt="MIT">
  <img src="https://img.shields.io/badge/opencode-2.4.1%20%7C%201.19.0-1a73e8" alt="opencode 2.4.1 / 1.19.0">
</p>

<p align="center"><a href="README.md">English</a> | <a href="README.zh-CN.md">中文</a></p>

---

## 介绍

opencode 不只是把问题丢给模型。它在每轮请求前拼系统提示词、在工具调用上挂审批门、用工具描述塑造模型的行为。所以「模型拒绝了」经常不是模型的决定，是宿主先把话堵死了。

**opencode-purge** 把这两层拆开：在你自己安装的 opencode 上，把宿主提示词、审批门、工具描述压平，让模型只面对你的指令。

dsh-purge 改的是 DeepSeek Harness 的 `@deepseek-ai/*` 包；opencode 是单个 Bun 编译的可执行文件，没有包目录，所以这里换了一套挂载点：

| 层 | 手段 |
| --- | --- |
| **提示词** | 插件 `setup(ctx)` 里注册 `ctx.session.hook("context")`，改写 `p.system: [{type:"text",text}]`，注入段替换宿主身份前言 |
| **审批** | 配置 `permissions` 有序数组（2.x）+ 旧 `permission` 映射（1.19）+ 钩子 `ctx.permission.hook("evaluate")` 把 `effect` 压成 `allow` |
| **工具** | 同一个 `context` 钩子给 `p.tools[name].description` 追加「无沙箱、无审批、任意路径」，覆盖 `shell`/`read`/`write`/`edit`/`patch`/`webfetch`/`websearch`/`subagent`/`skill`/`execute` |
| **宿主常量** | `--deep` 对 `opencode-cli.exe` 内嵌提示词做等长替换（偏移可回滚，磁盘上每一份副本都打） |
| **常驻** | `AGENTS.md` 托管规则块、红队技能、`/purge` 命令、`purge_*` 工具 |

同一份代码支持两代宿主。1.19 用字符串钩子名 + `(input, output)` 双参数；2.x 加载 `default { id, setup }` 对象、在 `ctx` 上命令式注册钩子。插件导出 2.x 形状，同时让目录里各 `check()` 认 1.19 的钩子名，所以两代上 `status` 都读得对。完整映射见 [docs/opencode-2.x.md](docs/opencode-2.x.md)。

---

## 能力对照（dsh-purge → opencode-purge）

| dsh-purge | 本仓库 | 落点 |
| --- | --- | --- |
| #1/#4/#25/#26/#43/#55 提示词重写 | `ctx.session.hook("context")`（1.19 是 `experimental.chat.system.transform`） | `plugin/opencode-purge.js` |
| 工作区 baseline strict/fallback/always | `policy.json` 的 `baseline: strip \| strict \| always` | `purge/policy.json` |
| `prompt-inject.md` 注入段 | 同文件同语义 | `prompt/prompt-inject.md` |
| #5/#8/#35/#62 审批门放平 | ① 配置 `permissions`（2.x 数组）/ `permission`（1.19 映射）② `ctx.permission.hook("evaluate")` | `opencode.json` + 插件 |
| #6/#7/#13–17/#51 沙箱栅栏 | opencode 无沙箱；`external_directory` / `.env` 放行 | `opencode.json` |
| #21 超时、#22 读上限 | `tool_output.max_lines/max_bytes` | `opencode.json` |
| #23 子代理深度 | `experimental.subagent_depth=4` | `opencode.json` |
| #29/#33/#48/#60 工具文案中立化 | context 载荷上的 `p.tools[name].description` | 插件 |
| #85 压缩后继续 | `ctx.session.hook("compaction")` 追加保活说明 | 插件 |
| 规则集 / Skill | `AGENTS.md` 托管块 + `skills/purge-*` | 宿主目录 |
| `/purge`、`purge_*` | 配置命令 + `ctx.tool.transform` | `opencode.json` / 插件 |
| 自己的服务器白名单 | `purge/net-scope-allow.txt` | `purge/` |
| 启动 shim | `purge/opencode-auto.ps1`（`opencode --auto`） | `purge/` |
| 宿主包文件补丁 | `--deep` 等长替换 + 偏移记录，覆盖全部副本 | `purge/deep.json` |

---

## 适配范围

- **实测**：opencode `2.4.1`（Windows x64，桌面版）与 `1.19.0`（Bun 单文件构建），模型 `deepseek-v4-flash` / `deepseek-v4-pro`。
- 两代插件契约都覆盖了。2.x 要求 `default { id, setup }`；返回 hooks 对象的 1.19 风格模块会在加载期被丢掉，报 `PluginModule.LoadError … Expected object at ["default"]`，其中所有钩子一条都不跑。`npm test` 会断言导出形状，防止再退回去。
- 钩子名与工具名两代不同，映射表见 [docs/opencode-2.x.md](docs/opencode-2.x.md)。
- 升级宿主后先拿临时目录试：

```powershell
$env:OPENCODE_CONFIG_DIR="C:\tmp\oc-test"
node bin/opencode-purge.js apply
```

- `--pure` 可跳过外部插件，用来做 A/B 对照（原生 vs 破甲）。

---

## 安装

**从源码（推荐，先看代码再装）**

```powershell
git clone https://github.com/oahcom/opencode-purge.git
cd opencode-purge
node bin/opencode-purge.js apply
```

**npm**

```powershell
npm i -g opencode-purge
opencode-purge apply
```

**应用后会做这些事**

```
~/.config/opencode/
├── plugins/opencode-purge.js      运行时钩子
├── purge/
│   ├── prompt-inject.md           注入段（可编辑；revert 保留）
│   ├── policy.json                baseline / compaction / netScope
│   ├── app/                       CLI 自安装副本
│   ├── opencode-purge.mjs         启动器（供 /purge、purge_* 调用）
│   ├── net-scope-allow.txt        出口白名单（可选）
│   ├── opencode-auto.ps1          --auto 启动包装
│   └── deep.json                  二进制补丁记录
├── AGENTS.md                      托管规则块（marker 包裹，可整块回滚）
├── skills/purge-*/SKILL.md        23 个红队技能
└── opencode.json                  permissions / permission / tool_output / commands / experimental
```

改插件或 `policy.json` 后**新开一个 opencode 会话**；只改注入段不用重启，下一轮请求就生效。

---

## 使用

```powershell
opencode-purge status      # 补丁状态、策略、最近注入日志
opencode-purge apply       # 全部层
opencode-purge apply --deep    # 追加二进制常量替换（运行中也能打，改名换入；--force 强制）
opencode-purge revert      # 还原（保留 prompt-inject.md）
opencode-purge uninstall   # 还原 + 删 purge/
opencode-purge edit        # 打印注入段
opencode-purge where       # 打印探测到的路径
opencode-purge deep --revert   # 只回滚二进制层
```

聊天里也有入口：

```
/purge status | apply | revert | uninstall
```

模型侧工具：`purge_status`、`purge_apply`、`purge_revert`。

---

## 工作原理

应用：

```mermaid
flowchart TD
  A["apply"] --> B["备份原件为 .opencodepurge.bak"]
  B --> C["落注入段 / 插件 / 策略"]
  C --> D["合并 opencode.json（permissions / permission / tool_output / commands / experimental）"]
  D --> E["写 AGENTS.md 托管块 + 导入技能"]
  E --> F{"--deep?"}
  F -->|是| G["等长替换 exe 内嵌提示词，记录偏移，覆盖全部副本"]
  F -->|否| H["跳过，其余层照装"]
```

每轮请求：

```mermaid
flowchart TD
  A["新一轮"] --> B{"policy.enabled?"}
  B -->|否| Z["原样放行"]
  B -->|是| C["读 prompt-inject.md"]
  C --> D{"baseline"}
  D -->|strip 默认| E["砍掉身份前言 part，留模型段 / 工具目录 / AGENTS"]
  D -->|strict| F["只留注入段 + env"]
  D -->|always| G["宿主提示词全留，注入段追加"]
  E --> H["输出 system"]
  F --> H
  G --> H
  H --> I["permission evaluate -> effect=allow"]
  I --> J["p.tools[name].description 追加中立化说明"]
```

`strip` 是默认值：砍掉宿主身份前言（"You are an AI agent running in OpenCode / 4 行以内 / 不要猜 URL"），但保留模型段、code-mode 工具目录、项目 AGENTS.md，避免把工具能力一起砍掉。2.4 上一轮正常请求的日志是 `strip dropped=1 kept=3`。

---

## 注入段

`prompt/prompt-inject.md` 不是手写的：`tools/build-frame.mjs` 读取 dsh-purge 的默认负载（约 21.6k 字符 / 26 KB，含 Scoped Rules、Intent mapping、Refusal Hardening、House Rules），末尾追加 `Host Adapter — opencode 2.4`：工具名映射（`shell` / `subagent` / `patch` / `execute`）、审批已放行、压缩保活。

```powershell
node tools/build-frame.mjs                       # 按 2.4 重建（默认）
node tools/build-frame.mjs --host 1.19           # 按旧钩子集重建
node tools/build-frame.mjs --from <其它负载> --out <输出>
```

`apply` 用 `purge/.frame.sha256` 记住安装时哈希：没被手改过就随版本刷新，改过则保留（输出 `frame kept (user edited)`）。插件每轮请求都重读文件，**换注入段不用重启**。

> 早期 1.0 用过 4.3 KB 精简段，强度不够：模型会答「合规路线」而不是交付实现。已换成上游原版负载。

---

## 二进制层（`--deep`）

opencode 的提示词是内嵌在可执行文件里的模板字符串。`--deep` 做**等长替换**：不足长度用空格补齐，不移动任何偏移，Bun 的 blob 结构不受影响。

打哪个文件取决于构建方式：

| 构建 | 文件 | 含提示词常量 |
| --- | --- | --- |
| 2.x 桌面版 | `Roaming\ai.opencode.desktop\cli\<版本>-<架构>\opencode-cli.exe` | 是 |
| 2.x 桌面版 | `Local\Programs\ai.opencode.desktop\resources\opencode-cli.exe` | 是（完全相同的副本） |
| 2.x 桌面版 | `Local\Programs\ai.opencode.desktop\OpenCode.exe` | 否 —— Electron 外壳 |
| 1.19 | `opencode.exe` | 是 |

桌面版把 CLI 装了两份，实际被 spawn 的可能是任一份，所以**每一份**含锚点的副本都打。`OPENCODE_BIN` 可锁定单一目标。

覆盖的常量（存在才替换，缺了就跳过）：

- `You are an AI agent running in OpenCode, a coding agent harness.`（2.4 身份）
- `Help the user accomplish their goals using the tools you have available.`（2.4 目标）
- `Keep responses clear and concise, and avoid unnecessary technical jargon.`（2.4 风格）
- `You are opencode, an interactive CLI tool …`（1.19 分支，在 2.x 里仍是活串）
- `You are OpenCode, the best coding agent on the planet.`
- `If you cannot or will not help the user with something …`（拒绝说教句）
- `You MUST answer concisely with fewer than 4 lines …`（行数上限）

安全设计：

- 只写校验通过的窗口；偏移与原始字节存 `purge/deep.json`；
- 回滚只在「当前字节仍等于我们写入的内容」时写回，不覆盖别人的改动；
- 首次写入前整份备份为 `<文件>.opencodepurge.bak`。

Windows 上两个必须处理的细节：

- **文件被占用。** 运行中的 exe 不能以写方式打开（`EBUSY`），但可以**改名**——加载器按句柄持有文件，不按路径。`writeImage()` 退化为「写临时文件 → 原名改走 → 临时文件改名就位」，并报 `(swapped; restart to take effect)`。旧进程继续跑内存里的旧字节，重启后吃到补丁。
- **第二次 apply。** 打过补丁后锚点消失，朴素实现会判成「无锚点」并从 `deep.json` 里删掉，导致不可回滚。`rebuildFromBackup()` 用 `.bak`（长度相同、偏移一致）反推精确记录，并与旧记录**合并**而不是覆盖。

实测 2.4.1：每份 CLI 副本 9 个窗口（2× 2.4 身份 + 2× 2.4 目标 + 2× 2.4 风格 + 1.19 身份 + 拒绝句 + 行数上限），两份副本全部命中，`deep --revert` 两份都能精确还原。

---

## 验证

插件把每轮决策写进 `purge/purge.log`：

```
setup id=opencode-purge home=... enabled=true baseline=strip pid=...
context: strip dropped=1 kept=3
context: strip inChars=25337 outChars=45228 outParts=4
context: tool descriptions extended n=9
permission: allow action=shell res=["..."]
setup done registered=session.hook(context),permission.hook(evaluate),session.hook(compaction),tool.hook(execute.before),tool.transform
```

三个可复现的检查点：

1. 问模型「系统提示词开头是什么」：应回 `<opencode_purge_frame …>` 或 `Host Adapter — opencode 2.4`。
2. 抓出站请求体（临时挂个 `http.request` 钩子即可）：`sysLen ≈ 45k`、注入段在、vendor 身份串不在。
3. `purge_status` 工具能调用且返回文本（不是 `null`）；`shell` 执行命令无审批弹窗。

**`purge.log` 完全没生成 = 插件没加载。** 那是模块导出形状的问题，不是钩子的问题，见 [docs/opencode-2.x.md](docs/opencode-2.x.md)。

---

## 排障：还是被拒

先看 `purge/purge.log` 最后一轮，分清宿主层还是模型层：

| 现象 | 判断 | 处理 |
| --- | --- | --- |
| 没有 `purge.log` | 插件在加载期被拒（2.x 上用了 1.19 的导出形状） | 升到 1.2.0；`npm test` 会断言导出形状 |
| `PluginModule.LoadError … Expected object at ["default"]` | 同上 | 同上 |
| 有日志但无新行 | 会话在安装前启动 | 新开会话 / 用 `opencode run` 探针 |
| `strip dropped=0` | 锚点没匹配上，常见于旧版打 `--deep` 之后 | 1.2.0 已把 deep 写入的身份串加入 `BASELINE_ANCHORS` |
| `purge_status` 返回 `null` | 工具返回了 `{output}` 但没声明 output schema | 1.2.0 已声明 `OUT_TEXT`；重跑 `apply` |
| 还弹审批，但 `status` 说 applied | 配置键被静默忽略：2.x 读 `permissions`（数组），不认 `permission`（映射），未知键直接丢掉且不报错 | 升到 1.2.0；两代键都写 |
| `outChars` < 20k | 注入段是薄版或被改短 | `node tools/build-frame.mjs && opencode-purge apply` |
| `outChars` ≥ 30k 仍被拒 | 模型层：RLHF 较硬或命中拒答触发词 | ① `baseline` 改 `strict` ② 换 `deepseek-v4-pro` 或换 provider ③ 在注入段补一条显式映射 |
| 换了注入段没变化 | 插件实例只在进程启动时读一次 `policy.json`；注入段每轮重读 | 注入段热更新；`policy.json` 需新会话 |

宿主拦截会说「工具未授权 / 需要审批 / sandbox 拒绝」；模型拒绝是自然语言说教。说教文风 = 注入段权重不够，不是移植失败。

---

## 还原与卸载

- 每个目标文件首次修改前备份为 `<文件>.opencodepurge.bak`。
- `revert` 用备份还原并删备份；`opencode.json` 逐字节还原（含文件尾换行）。
- `prompt-inject.md` 是用户文件，`revert` 保留；`uninstall` 才删。
- 重复 `apply` 幂等。

```powershell
opencode-purge revert        # 回到原版宿主
opencode-purge uninstall     # 连 purge/ 一起清掉
opencode-purge deep --revert # 只回滚 exe
```

---

## 目录结构

```
opencode-purge/
├── bin/opencode-purge.js   CLI 入口
├── lib/
│   ├── paths.js            路径与宿主探测
│   ├── fsx.js              文件读写 / 备份 / 日志
│   ├── config-patch.js     opencode.json 手术与精确还原
│   ├── catalog.js          补丁目录（18 条）
│   ├── deep.js             二进制层
│   ├── engine.js           apply / revert / status
│   └── ui.js               终端配色
├── plugin/opencode-purge.js  运行时钩子
├── prompt/prompt-inject.md   注入段
├── skills/redteam/*.md       23 个红队技能（源自 dsh-purge）
├── tools/build-frame.mjs     注入段构建（`--host 1.19|2.4`）
├── docs/
│   ├── architecture.md       架构与数据流
│   └── opencode-2.x.md       2.x 的钩子 / 工具 / 二进制映射
├── examples/                 策略样例
└── test/smoke.mjs            安装 / 还原 / 插件形状冒烟测试
```

补丁总览：

| 组 | 条目 |
| --- | --- |
| 提示词 | PT-01 注入段、PT-02 提示词接管、PT-03 覆盖策略、PT-04 压缩保活 |
| 审批 | AP-01 全局放行、AP-02 外部目录、AP-03 doom_loop、AP-04 `.env`、AP-05 审批钩子 |
| 工具 | TL-01 描述中立化、TL-02 子代理深度、TL-03 输出上限 |
| 宿主 | HS-01 规则块、HS-02 技能、HS-03 `/purge`、HS-04 出口白名单 |
| 深度 | DP-01 二进制常量、DP-02 `--auto` 包装 |

`PT-01`、`AP-05`、`TL-01`、`DP-01` 两代标记都认，所以 1.19 装和 2.x 装上 `status` 都读得对，不用改目录。`DP-01` 只在「记录里的二进制还在、且还持有我们的 payload」时报 `applied`——指向已删除副本的陈旧记录算 `pending`。

---

## 注意

- 只作用于**本机** `~/.config/opencode` 与它探测到的 opencode 可执行文件，不联网、不扫描、不上传。
- 插件钩子是 opencode 官方扩展点；二进制层属于本地二改，升级 opencode 后需重跑 `apply --deep`。
- 自用与授权评测可以，别拿它去打不属于你的系统。

---

## 署名与许可

MIT。思路、补丁分层、注入段与技能集来自 [dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)（MIT），二次分发请保留 `LICENSE` 末尾的署名段与仓库链接。
