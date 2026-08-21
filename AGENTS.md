# CloudChat — Cloudflare Workers 聊天室

基于 Cloudflare Workers + Durable Objects 的实时聊天室（网页端 + Android 客户端 + Hacknet 对战 + 权限系统 + 经济/运营体系）。本项目为**主开发仓库**：主站部署、archive 存档、Android 客户端配套均以本仓库为准。

## 仓库结构（双仓同源）

| 仓库 | 路径 | 角色 |
|---|---|---|
| **主仓（本仓库）** | `I:\Cloudflare-Workers-Chat-master` | **主要开发地**；主站部署（chat.liuxiyu.cn）+ archive 存档（GitHub: MEMZ-CHROER/Cloudflare-Chat-Lxy） |
| **Dsl 仓** | `I:\Cloudflare-Dsl-Chat` | Dsl 工作仓（fork 自上游 Dsl114514，GitHub: MEMZ-CHROER/Cloudflare-Dsl-Chat）；代码同步后由**用户提 PR 给上游 Dsl114514** |

### 与 Dsl 仓的联系（关键）
- **src 完全同源**：忽略行尾 CRLF/LF 后，两仓 `src/` diff 为空。Dsl 仓 `wrangler.toml`（dslirc zone 路由 + secret 配置）与 `Dsl.txt` 是 Dsl 特有文件，**不随 src 覆盖**
- **同步方向（主仓 → Dsl）**：改动后把 `src/` 下受影响文件 `cp` 到 Dsl 仓对应路径 → Dsl 仓 `git add && commit && push origin master` → 用户 GitHub 提 PR
- **Dsl 站独立部署**：Dsl 站域名 `dslirc.indevs.in` 系列，zone 不在本 CF 账号（Lxy130523）下，`wrangler deploy` 报 zone 10083 → **Dsl 站部署由 Dsl 侧处理**，主仓不部署 Dsl 站
- **Dsl 站 archive**：`node scripts/archive-latest.mjs <版本号> TaxDsl https://chat.dslirc.indevs.in`（Dsl 超管密钥 2026-08-09 改，旧 xT9vK 失效；需 Dsl 侧配合）
- 同步时**主仓新增源码文件必须跟着复制**（webhooks.mjs/exp.mjs/achievements.mjs 等）；`MEMZ-CHROER/Cloudflare-Friend-chat` 已废弃，不要操作

## 架构

- **后端**：`src/index.mjs`（fetch 入口）+ 4 个 Durable Objects：
  - `ChatRoom`（房间，WebSocket/消息/敏感词/经济/媒体/Hacknet）→ `src/chatroom.mjs`（v1.57 拆六模块：`http/activity/permissions/schedule/conn/rollback`）
  - `RoomRegistry`（全局用户/会话/LP 权限/存档/经济/关系链/OAuth）→ `src/registry.mjs`
  - `VersionArchive`（版本存档，store 格式）→ `src/archive.mjs`
  - `FileBucket`（文件桶）→ `src/filebucket.mjs`
- **前端多运行时**（v1.53 理念）：原生 JS 消息流（`src/client/chat/` 模块化，CHAT_MODULES 注册）+ Vue3 弹窗/后台（`/admin-vue`、LP 网页编辑器 lp.js）+ overlay Modal 管理器
- **Android 客户端**：独立仓 `I:/Cloudflare-Chat-Android`（Kotlin + Compose）
- **持久化**：DO storage；LP 权限数据走 `persistence.mjs loadAll`（数组→Map 转换）；archive 用 base64 分块绕过 128KB 单值上限

## 部署

### 主站（本仓库目录）
```bash
cd I:\Cloudflare-Workers-Chat-master
NODE_OPTIONS=--dns-result-order=ipv4first npx wrangler deploy
```
- worker 名 `cloudflare-workers-chat`，账号 Lxy130523，主域 `chat.liuxiyu.cn` + 5 个 dpdns 镜像；路由在 Cloudflare Dashboard（不在 wrangler.toml）
- ⚠️ **部署后必须确认生产版本**：`npx wrangler deployments list` 顶部 = 当前生产。曾有非我方部署抢占生产 30 秒，导致新代码未真正上线（archive 鉴权错乱）。**别假设 deploy 输出 = 线上生效**
- git push 会触发 Workers Builds（已配 npm ci；package-lock.json 必须同步提交否则 ci 失败）
- Dsl 站部署见上"与 Dsl 仓的联系"（Dsl 侧处理）

## 版本更新完整流程（每次必走）

1. **改代码** → 语法检查（`node --check`）→ 同步两仓
2. **先改 changelog 再存档**（`src/changelog.html`，最新版本在顶部展开；先存档会打包旧 changelog → 回滚版本对不上）
3. **部署主站**（wrangler deploy，cwd 用主仓）
4. **主站 archive**：`node scripts/archive-latest.mjs <版本号> 9167c945079746dbfa6cd249df4ad64f102e9e34a366624539ee3ac7cfefa16e https://chat.liuxiyu.cn`（super key 明文在 `wrangler.toml [vars]` 段，不是 dashboard secret）
5. **提交两仓**：主仓 push 后同步 Dsl（cp src/ 受影响文件）→ Dsl push 前 `git pull --rebase origin master`（远端可能有新提交）；用 `git -C <仓库>` 显式指定，别依赖 cwd

## 密钥

| 用途 | 值 | 位置 |
|---|---|---|
| 主站 super（ADMIN_SECRET_KEY） | `9167c945079746dbfa6cd249df4ad64f102e9e34a366624539ee3ac7cfefa16e` | `wrangler.toml [vars]`（两仓） |
| 主站 admin（ADMIN_KEY） | `7a7be27563c45956c313005973b4902a15b7a1008c207c05` | `wrangler.toml [vars]`（两仓） |
| 主站 DESTROY_KEY | `lxy130523` | `wrangler.toml [vars]` |
| Dsl 站 super | `TaxDsl` | Dsl 侧配置 |

GITHUB_TOKEN / AI_API_KEY / CF_API_TOKEN / GITHUB_CLIENT_SECRET 为 secret（`wrangler secret put`），**勿写入仓库**。

## 测试（本仓库根目录，node 直跑）

- `test-profanity.mjs`：敏感词 leetspeak 回归（61 用例：58 纯数字放行 / 5h2t/f*ck/wunw 绕过拦截 / 中文组合防误伤）
- `test-lp.mjs`：LP 权限系统（44 用例：组继承/防环/复数别名/default 组）
- `test-chat-modals-*.mjs`：jsdom 聊天室渲染回归
- `test-admin-vue.mjs`、`test-stats-section.mjs`、`test-offline.mjs` 等
- Android：`I:/Cloudflare-Chat-Android`（38 测试含 Robolectric JVM 渲染，模拟器不可用）

## 关键约定与坑（血泪教训）

- **命令处理必须优先于内容过滤**：chatroom.mjs 敏感词检查在 `/lp` 等命令判断之前曾被拦（`/w 游客9933` 的 `\W` 把中文当标点顶替字母拼成 nmb）→ 已修：`/` 开头消息跳过敏感词；leetspeak 标点顶替排除中文 `[^\w一-鿿]`，3 字母以下短词根不做字母顶替
- **JS `\W`/`\b` 对 CJK 语义与直觉不符**（无 u flag 时中文是 `\W`）——敏感词/边界正则注意
- **archive 上传要 super**（`X-Admin-Key` 头），普通 admin 403；版本号显式传（脚本默认取最旧）
- **DO 实例按代码版本冻结**：活跃房间/registry 跑旧代码直到回收，验证新行为用全新房间名/在线实测
- **CRLF 差异**：两仓行尾不同，`diff` 用 `--strip-trailing-cr`；cp 同步后 `git add` 自动消化
- **注册限频**：冒烟测试用现有账号（`.hn-sess.json`）或复用 hacknet 账号，别狂注册（429）
- **archive-latest.mjs 打包 store 格式**（`zipSync level:0`）；Dsl 站 403 通常是 Dsl 侧 key 未更新
- **archive key 在 `wrangler.toml [vars]` 明文**（非 dashboard secret，settings API 不返回）——曾误判"key 被轮换"，实为生产版本 vars 配置不同

## 最近版本状态（2026-08-21，v1.60 系列）

- **v1.60 敏感词加固**：58 纯数字误伤修复 + leetspeak 三类绕过拦截（5h2t/f*ck/wunw 同形）+ 拼音缩写独立成词防跨词误伤 + 命令消息跳过敏感词 + 中文排除
- **LP 增强**：`permissions` 复数兼容 + **default 组**（无组用户默认继承，组预置为空，可 `/lp group default permission set 节点` 批量授权）
- 前面版本：v1.59 单文件资源存储 / v1.58 离线消息补发 / v1.57 代码质量工程 / v1.56 内容沉淀（markdown+知识库）/ v1.55 账号纵深 / v1.54 运营看板 / v1.53 多运行时 / v1.52 admin-vue 迁移 / v1.50-51 LP 编辑器 / v1.49 权限系统 / v1.47 交易市场 / v1.46 GitHub OAuth / v1.45 赛季+荣誉 / v1.43 Hacknet 对战 / v1.40 Hacknet 主题 / v1.39 icco / v1.38 主题系统

## 相关文档

- `README.md` — 项目介绍与功能列表
- `DEPLOY-ROLLBACK.md` — 应急回滚说明
- `src/changelog.html` — 版本历史（改代码必须先改它）
- `CHAT_PERMISSIONS.txt` — LP 权限节点全清单（80+ chat.<域>.<动作>，主仓根目录）
- `scripts/archive-latest.mjs`、`archive-file-upload.mjs` — 存档/文件上传脚本
- Dsl 仓：`I:\Cloudflare-Dsl-Chat\AGENTS.md`（Dsl 视角的双仓说明）
- 安卓客户端：`I:/Cloudflare-Chat-Android`
