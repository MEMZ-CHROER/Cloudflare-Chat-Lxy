#!/usr/bin/env node
// 自动存档脚本 — 把当前 src/ 代码打包成 zip 上传到 archive 系统（每次部署后运行）
// 用法: node scripts/archive-latest.mjs [版本号] [管理密钥] [基础URL]
//   版本号默认从 src/changelog.html 的最新 <span class="version-tag"> 解析（如 1.21）
//   管理密钥默认从环境变量 ADMIN_KEY 或 ARCHIVE_KEY 读取
//   基础URL默认 https://chat.liuxiyu.cn
import { zipSync } from "./vendor/fflate.mjs";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC = join(ROOT, "src");

function walk(dir, base) {
  let out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = join(base, entry);
    if (entry === ".git" || entry === "node_modules" || entry === "src.rar") continue;
    const st = statSync(full);
    if (st.isDirectory()) out = out.concat(walk(full, rel));
    else if (st.size <= 5 * 1024 * 1024) out.push(rel);
  }
  return out;
}

function latestVersion() {
  try {
    const html = readFileSync(join(SRC, "changelog.html"), "utf8");
    const m = [...html.matchAll(/version-tag">v?(\d+\.\d+)/g)];
    if (m.length) return m[m.length - 1][1];
  } catch (e) {}
  return null;
}

const version = process.argv[2] || latestVersion();
const key = process.argv[3] || process.env.ADMIN_KEY || process.env.ARCHIVE_KEY || "";
const base = process.argv[4] || "https://chat.liuxiyu.cn";

if (!version) { console.error("❌ 无法确定版本号，请传入: node scripts/archive-latest.mjs <版本号>"); process.exit(1); }
if (!key) { console.error("❌ 缺少管理密钥，请传入或设置 ADMIN_KEY/ARCHIVE_KEY 环境变量"); process.exit(1); }

const files = {};
for (const rel of walk(SRC, "")) {
  const norm = rel.split("\\").join("/");
  files["src/" + norm] = readFileSync(join(SRC, norm));
}
const zip = zipSync(files, { level: 0 });

console.log(`打包完成: ${Object.keys(files).length} 个文件, ${(zip.length / 1024).toFixed(1)} KB, 版本 ${version}`);
const resp = await fetch(base + "/api/archive/upload?name=" + encodeURIComponent(version) + "&description=" + encodeURIComponent("自动存档 " + version), {
  method: "POST",
  headers: { "X-Admin-Key": key, "Content-Type": "application/octet-stream" },
  body: zip
});
const text = await resp.text();
console.log(`上传结果 [${resp.status}]: ${text.slice(0, 300)}`);
