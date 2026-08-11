#!/usr/bin/env node
// 📦 单文件资源上传/管理脚本 — POST/GET /api/archive/file?path=
//
// 用法：
//   node archive-file-upload.mjs <本地文件> [目标路径]    # 上传（目标路径默认 Content/<文件名>）
//   node archive-file-upload.mjs --list                  # 列出已上传文件
//   node archive-file-upload.mjs --delete <path>         # 删除文件
//
// 环境变量：BASE=<域名> 覆盖默认 https://chat.liuxiyu.cn；KEY=<超管密钥> 覆盖自动读取 wrangler.toml
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "https://chat.liuxiyu.cn";
let KEY = process.env.KEY || "";

function readKeyFromWrangler() {
  try {
    const txt = fs.readFileSync(path.join(import.meta.dirname, "wrangler.toml"), "utf8");
    const m = txt.match(/ADMIN_SECRET_KEY\s*=\s*"([0-9a-f]+)"/);
    if (m) return m[1];
  } catch (_) {}
  return "";
}

const args = process.argv.slice(2);
if (!KEY) KEY = readKeyFromWrangler();

async function main() {
  if (!KEY) {
    console.error("未找到超管密钥（wrangler.toml 或 KEY 环境变量）");
    process.exit(1);
  }

  if (args[0] === "--list") {
    const r = await fetch(`${BASE}/api/archive/file-list`, { headers: { "X-Admin-Key": KEY } });
    console.log("status:", r.status, await r.text());
    return;
  }

  if (args[0] === "--delete") {
    const p = args[1];
    if (!p) { console.error("用法: --delete <path>"); process.exit(1); }
    const r = await fetch(`${BASE}/api/archive/file-delete?path=${encodeURIComponent(p)}`, {
      headers: { "X-Admin-Key": KEY },
    });
    console.log("status:", r.status, await r.text());
    return;
  }

  const local = args[0];
  if (!local) {
    console.error("用法: node archive-file-upload.mjs <本地文件> [目标路径]  |  --list  |  --delete <path>");
    process.exit(1);
  }
  const target = args[1] || "Content/" + path.basename(local);
  const buf = fs.readFileSync(local);
  const r = await fetch(`${BASE}/api/archive/file?path=${encodeURIComponent(target)}`, {
    method: "POST",
    headers: { "X-Admin-Key": KEY, "Content-Type": "application/octet-stream" },
    body: buf,
  });
  console.log("上传", local, "→", target);
  console.log("status:", r.status, await r.text());
}

main().catch((e) => {
  console.error("错误:", e.message);
  process.exit(1);
});
