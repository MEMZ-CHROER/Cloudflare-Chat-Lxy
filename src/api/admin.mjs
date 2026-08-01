// 管理后台 API - 所有 /api/admin/* 路由
// 主入口：认证检查 + 按领域分发到各 handler 模块

import { handleAdminRooms } from "./admin/rooms.mjs";
import { handleAdminUsers } from "./admin/users.mjs";
import { handleAdminIpBan } from "./admin/ip-ban.mjs";
import { handleAdminPoints } from "./admin/points.mjs";
import { handleAdminShop } from "./admin/shop.mjs";
import { handleAdminTasks } from "./admin/tasks.mjs";
import { handleAdminTags } from "./admin/tags.mjs";
import { handleAdminLottery } from "./admin/lottery.mjs";
import { handleAdminBot } from "./admin/bot.mjs";
import { handleAdminMessages } from "./admin/messages.mjs";
import { handleAdminKey } from "./admin/key.mjs";
import { handleAdminEmoji } from "./admin/emoji.mjs";
import { handleAdminRedeem } from "./admin/redeem.mjs";
import { handleAdminLog } from "./admin/log.mjs";
import { handleAdminMute } from "./admin/mute.mjs";

// 🔒 安全修复（A10）：常量时间字符串比较，降低远程时序测信道风险
function safeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// 操作日志助手
async function logAdminAction(env, operator, action, target, detail) {
  try {
    let registryId = env.registry.idFromName("global");
    let stub = env.registry.get(registryId);
    await stub.fetch("https://dummy-url/log/add", {
      method: "POST",
      body: JSON.stringify({operator, action, target, detail}),
      headers: {"Content-Type": "application/json"}
    });
  } catch (e) {}
}

export async function handleAdmin(path, request, env) {
  const url = new URL(request.url);
  const requestKey = url.searchParams.get("key");

  async function getAdminPermission(k, e) {
    // 🔒 安全修复（LD12/LD13）：URL 无 key 时从 httpOnly Cookie 读取（JS 不可读，防 XSS 窃取管理密钥）
    if (!k) {
      let m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)admin_key=([^;]+)/);
      if (m) { try { k = decodeURIComponent(m[1]); } catch (_) { k = m[1]; } }
    }
    // 🔒 安全修复：未配置管理密钥时直接拒绝，绝不用默认弱密钥("del"/"mod")兜底；空 key 一律拒绝
    if (k && safeEqual(k, e.ADMIN_SECRET_KEY)) return "super";
    if (k && safeEqual(k, e.ADMIN_KEY)) return "admin";
    try {
      let rid = e.registry.idFromName("global");
      let stub = e.registry.get(rid);
      let r = await stub.fetch("https://dummy-url/combined-auth?key=" + encodeURIComponent(k));
      let d = await r.json();
      if (d.level) return d.level;
    } catch (_) {}
    return null;
  }

  // 🔒 安全修复（LD12）：管理登录/登出端点（httpOnly Cookie，JS 不可读）
  if (path[1] === "login" && request.method === "POST") {
    try {
      let body = await request.json();
      let k = String(body.key || "");
      let p = await getAdminPermission(k, env);
      if (!p) return new Response(JSON.stringify({error: "密钥无效"}), {status: 401, headers: {"Content-Type": "application/json"}});
      let resp = new Response(JSON.stringify({ok: true, level: p}), {status: 200, headers: {"Content-Type": "application/json"}});
      // admin_key: httpOnly 密钥（JS 不可读）；admin_logged: 非 httpOnly 登录标记（供前端显示管理菜单，不含密钥）
      resp.headers.set("Set-Cookie", "admin_key=" + encodeURIComponent(k) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400");
      resp.headers.append("Set-Cookie", "admin_logged=1; Path=/; SameSite=Lax; Max-Age=86400");
      return resp;
    } catch (e) { return new Response(JSON.stringify({error: "请求解析失败"}), {status: 400}); }
  }
  if (path[1] === "logout" && request.method === "POST") {
    let resp = new Response(JSON.stringify({ok: true}), {status: 200});
    resp.headers.set("Set-Cookie", "admin_key=; Path=/; HttpOnly; Max-Age=0");
    resp.headers.append("Set-Cookie", "admin_logged=; Path=/; Max-Age=0");
    return resp;
  }

  const permission = await getAdminPermission(requestKey, env);
  if (!permission) {
    return new Response("未经授权。密钥不匹配或未设置。", { status: 401 });
  }

  // 🔒 安全修复（A1）：普通管理员（ADMIN_KEY）仅允许日常运维功能；
  // destroy-room（销毁房间）、delete-user（删用户）、redeem（兑换码铸币）、log（审计日志）、
  // kick-protect、global-blacklist、room-users-detail（含真实IP）等破坏性/超管专属操作仅限 super（ADMIN_SECRET_KEY）
  const adminAllowedPaths = ["clear-room", "kick-user", "auth-check", "room-users", "blacklist", "room-files", "room-file-data", "room-messages", "points", "shop", "tasks", "task", "announcement", "user-tags", "tag", "bot", "lottery", "room-password", "emoji", "message", "mute", "unmute", "mute-list"];

  if (path[1] === "auth-check") {
    return new Response(JSON.stringify({level: permission}), {
      status: 200, headers: {"Content-Type": "application/json"}
    });
  }

  if (permission === "admin" && !adminAllowedPaths.includes(path[1])) {
    return new Response("无权限访问此管理功能。", { status: 403 });
  }

  // 按领域分发
  let result = null;

  // rooms: clear-room, destroy-room, room-users, kick-user, room-users-detail, room-files, room-file-data, room-messages
  if (["clear-room", "destroy-room", "room-users", "kick-user", "room-users-detail", "room-files", "room-file-data", "room-messages"].includes(path[1]))
    result = await handleAdminRooms(path, request, env, url);

  // users: all-users, global-kick, users, user-ips, ban, global-blacklist, delete-user
  if (!result && ["all-users", "global-kick", "users", "user-ips", "ban", "global-blacklist", "kick-protect", "delete-user"].includes(path[1]))
    result = await handleAdminUsers(path, request, env, url);

  if (!result && path[1] === "ip-ban")
    result = await handleAdminIpBan(path, request, env, url);

  if (!result && path[1] === "points")
    result = await handleAdminPoints(path, request, env, url);

  if (!result && path[1] === "shop")
    result = await handleAdminShop(path, request, env, url);

  if (!result && path[1] === "tasks")
    result = await handleAdminTasks(path, request, env, url);

  if (!result && ["tag", "user-tags"].includes(path[1]))
    result = await handleAdminTags(path, request, env, url);

  if (!result && path[1] === "lottery")
    result = await handleAdminLottery(path, request, env, url);

  if (!result && path[1] === "bot")
    result = await handleAdminBot(path, request, env, url);

  if (!result && ["announcement", "blacklist", "message", "send-message"].includes(path[1]))
    result = await handleAdminMessages(path, request, env, url);

  if (!result && path[1] === "admin-key")
    result = await handleAdminKey(path, request, env, url);

  if (!result && path[1] === "room-password")
    result = await handleAdminRooms(path, request, env, url);

  if (!result && path[1] === "emoji")
    result = await handleAdminEmoji(path, request, env, url);

  if (!result && path[1] === "redeem")
    result = await handleAdminRedeem(path, request, env, url);

  if (!result && path[1] === "log")
    result = await handleAdminLog(path, request, env, url);

  if (!result && ["mute", "unmute", "mute-list"].includes(path[1]))
    result = await handleAdminMute(path, request, env, url);

  if (result) {
    // 🔒 安全修复（A4）：记录管理操作日志（此前 logAdminAction 从未被调用，审计形同虚设）
    if (result.status && result.status < 300) {
      let target = url.searchParams.get("name") || url.searchParams.get("room") || url.searchParams.get("ip") || "";
      // 🔒 安全修复（LD14）：剥离 key/newkey/auth 等敏感参数，管理密钥不写入日志
      let cleanParams = new URLSearchParams(url.search);
      cleanParams.delete("key"); cleanParams.delete("newkey"); cleanParams.delete("auth");
      let cleanQs = cleanParams.toString();
      let detail = url.pathname + (cleanQs ? "?" + cleanQs : "");
      await logAdminAction(env, permission === "super" ? "super" : "admin", path[1], target, detail);
    }
    return result;
  }
  return new Response("未找到管理操作。", { status: 404 });
}
