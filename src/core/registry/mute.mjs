// 禁言系统 — 存储在 RoomRegistry
// 数据结构: Map<name, {until, reason, mutedBy, createdAt}>
// until: 时间戳（永久用 Number.MAX_SAFE_INTEGER）
export async function handleMute(reg, request, url) {
  let path = url.pathname;

  // 管理员设置禁言 — 需管理密钥（red/cyan 管理员由 admin.mjs 校验后转发）
  if (path === "/admin/mute" && request.method === "POST") {
    let body = await request.json().catch(() => ({}));
    let name = String(body.name || "").trim();
    let duration = String(body.duration || "10m").trim(); // 1m | 10m | 1h | permanent
    if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400, headers: {"Content-Type": "application/json"}});

    let ms = 0;
    if (duration === "1m") ms = 60 * 1000;
    else if (duration === "10m") ms = 10 * 60 * 1000;
    else if (duration === "1h") ms = 60 * 60 * 1000;
    else if (duration === "permanent") ms = Number.MAX_SAFE_INTEGER;
    else return new Response(JSON.stringify({error: "时长无效，请用 1m/10m/1h/permanent"}), {status: 400, headers: {"Content-Type": "application/json"}});

    let until = Date.now() + (ms === Number.MAX_SAFE_INTEGER ? 0 : ms);
    if (duration === "permanent") until = Number.MAX_SAFE_INTEGER;
    reg.mutes.set(name, {until, reason: String(body.reason || "").slice(0, 100), mutedBy: body.mutedBy || "", createdAt: Date.now()});
    await reg.saveMutes();
    return new Response(JSON.stringify({ok: true, name, duration, until}), {status: 200, headers: {"Content-Type": "application/json"}});
  }

  // 管理员解除禁言
  if (path === "/admin/unmute" && request.method === "POST") {
    let body = await request.json().catch(() => ({}));
    let name = String(body.name || "").trim();
    if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400, headers: {"Content-Type": "application/json"}});
    reg.mutes.delete(name);
    await reg.saveMutes();
    return new Response(JSON.stringify({ok: true, name}), {status: 200, headers: {"Content-Type": "application/json"}});
  }

  // 查询某个用户禁言状态（公开只读）
  if (path === "/mute-status") {
    let name = url.searchParams.get("name") || "";
    let rec = reg.mutes.get(name);
    if (!rec) return new Response(JSON.stringify({muted: false}), {status: 200, headers: {"Content-Type": "application/json"}});
    let remaining = rec.until - Date.now();
    if (remaining <= 0) {
      reg.mutes.delete(name);
      await reg.saveMutes();
      return new Response(JSON.stringify({muted: false}), {status: 200, headers: {"Content-Type": "application/json"}});
    }
    // 🔒 安全修复（F7）：脱敏——不向公开端点返回 mutedBy（禁言操作者身份仅管理端可见）
    return new Response(JSON.stringify({muted: true, until: rec.until, remainingMs: remaining, permanent: rec.until === Number.MAX_SAFE_INTEGER, reason: rec.reason || ""}), {status: 200, headers: {"Content-Type": "application/json"}});
  }

  // 查询所有禁言列表（admin 校验在 api 层）
  if (path === "/admin/mute-list") {
    let result = [];
    for (let [name, rec] of reg.mutes) {
      let remaining = rec.until - Date.now();
      if (remaining <= 0) { reg.mutes.delete(name); continue; }
      result.push({name, until: rec.until, remainingMs: remaining, permanent: rec.until === Number.MAX_SAFE_INTEGER, reason: rec.reason || "", mutedBy: rec.mutedBy || "", createdAt: rec.createdAt || 0});
    }
    await reg.saveMutes();
    return new Response(JSON.stringify(result), {status: 200, headers: {"Content-Type": "application/json"}});
  }

  return new Response(JSON.stringify({error: "未找到操作"}), {status: 404, headers: {"Content-Type": "application/json"}});
}

// 发言拦截检查 — 返回 null（可发言）或 {remainingMs, permanent, reason}
export async function checkMuted(reg, name) {
  if (!name || !reg.mutes || reg.mutes.size === 0) return null;
  let rec = reg.mutes.get(name);
  if (!rec) return null;
  let remaining = rec.until - Date.now();
  if (remaining <= 0) {
    reg.mutes.delete(name);
    await reg.saveMutes();
    return null;
  }
  return {remainingMs: remaining, permanent: rec.until === Number.MAX_SAFE_INTEGER, reason: rec.reason || ""};
}
