# Dsl 站部署 + 应急回滚功能 交接说明

> 本仓库已实现**应急回滚**功能，并附带**自动存档**脚本。以下为 Dsl 侧部署与配置所需。

## 一、功能说明

**应急回滚**：聊天室出问题时，超管在任意房间的聊天框输入：

```
/rollback <版本号> <超管密钥>
```

会从存档系统（archive）拉取指定版本的项目代码，通过 Cloudflare API 把**线上 worker 重新部署为该版本**。
仅改线上部署，**不影响 GitHub 仓库代码**。

**自动存档**：每次代码更新后，把 `src/` 打包成 zip 上传到存档系统，这样 `/rollback` 才有版本可回：

```bash
node scripts/archive-latest.mjs <版本号> <管理密钥> https://chat.dslirc.indevs.in
```

## 二、必须配置的环境变量

### 普通变量（可放 wrangler.toml `[vars]` 或 Dashboard → Settings → Variables）

| 变量 | 值 | 说明 |
|---|---|---|
| `ADMIN_SECRET_KEY` | `xT9vK2mPqL5nR8wYbJ4hFzA6cD1sU3eG7iO0kM5pN8rW2yX4aB6dH9jE1fZ3tC` | 超管密钥（`/rollback` 用它校验） |
| `ADMIN_KEY` | 自设一个 | 普通管理密钥（管理后台登录） |
| `AI_BASE_URL` | 如 `https://api.deepseek.com/v1` | AI 对话/翻译 |
| `AI_MODEL` | 如 `deepseek-v4-flash` | AI 模型 |
| `AI_SYSTEM_PROMPT` | 如 `你是一个友好的助手` | AI 系统提示 |
| `CF_ACCOUNT_ID` | Dsl 的 Cloudflare 账号 ID | `/rollback` 调部署 API 用 |
| `CF_SCRIPT_NAME` | 默认 `cloudflare-workers-chat` | worker 脚本名 |

### Secret（用 `wrangler secret put` 配置，勿写进仓库）

```bash
npx wrangler secret put AI_API_KEY       # AI 服务 API Key
npx wrangler secret put CF_API_TOKEN     # Cloudflare API Token（权限：Workers Scripts → Edit 即可，别用全权）
```

## 三、部署步骤

```bash
npx wrangler deploy
```

> 注意：`wrangler.toml` 里的 Durable Objects migrations 已移除（4 个 DO 类已在 Cloudflare 侧注册）。
> 若在**全新账号**部署时报"类不存在"，按 `wrangler.toml` 中注释加回：
> ```toml
> [[migrations]]
> tag = "v1"
> new_sqlite_classes = ["ChatRoom", "RoomRegistry", "VersionArchive", "FileBucket"]
> ```

## 四、每次更新后

```bash
# 打包并上传当前代码为最新存档
node scripts/archive-latest.mjs 1.21 <ADMIN_KEY> https://chat.dslirc.indevs.in
```

## 五、超管使用示例

```
/rollback 1.21 xT9vK2mPqL5nR8wYbJ4hFzA6cD1sU3eG7iO0kM5pN8rW2yX4aB6dH9jE1fZ3tC
```

## 六、注意事项

1. **只能回滚到"自动存档过"的版本**（脚本生成的是 store 格式 zip；之前手动传的压缩格式会提示"不支持的压缩方式"，重存一次即可）。
2. 回滚后线上 = 旧版本代码；要恢复最新功能需重新 `wrangler deploy` 或触发 Builds。
3. `ADMIN_SECRET_KEY`、`CF_API_TOKEN`、`AI_API_KEY` 等敏感值**只配置到 Cloudflare，勿写进公开仓库**。
4. 管理后台密钥现走 httpOnly Cookie（`/api/admin/login`），登录后浏览器自动携带，不在 URL/日志中出现。
