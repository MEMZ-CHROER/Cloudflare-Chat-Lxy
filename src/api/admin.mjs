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
    // 🔒 安全修复：未配置管理密钥时直接拒绝，绝不用默认弱密钥("del"/"mod")兜底
    if (k === e.ADMIN_SECRET_KEY) return "super";
    if (k === e.ADMIN_KEY) return "admin";
    try {
      let rid = e.registry.idFromName("global");
      let stub = e.registry.get(rid);
      let r = await stub.fetch("https://dummy-url/combined-auth?key=" + encodeURIComponent(k));
      let d = await r.json();
      if (d.level) return d.level;
    } catch (_) {}
    return null;
  }

  const permission = await getAdminPermission(requestKey, env);
  if (!permission) {
    return new Response("未经授权。密钥不匹配或未设置。", { status: 401 });
  }

  // 🔒 安全修复（A1）：普通管理员（ADMIN_KEY）仅允许日常运维功能；
  // destroy-room（销毁房间）、delete-user（删用户）、redeem（兑换码铸币）、log（审计日志）、
  // kick-protect、global-blacklist、room-users-detail（含真实IP）等破坏性/超管专属操作仅限 super（ADMIN_SECRET_KEY）
  const adminAllowedPaths = ["clear-room", "kick-user", "auth-check", "room-users", "blacklist", "room-files", "room-file-data", "room-messages", "points", "shop", "tasks", "task", "announcement", "user-tags", "tag", "bot", "lottery", "room-password", "emoji", "message"];

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

  if (result) {
    // 🔒 安全修复（A4）：记录管理操作日志（此前 logAdminAction 从未被调用，审计形同虚设）
    if (result.status && result.status < 300) {
      let target = url.searchParams.get("name") || url.searchParams.get("room") || url.searchParams.get("ip") || "";
      await logAdminAction(env, permission === "super" ? "super" : "admin", path[1], target, url.pathname + url.search);
    }
    return result;
  }
  return new Response("未找到管理操作。", { status: 404 });
}
