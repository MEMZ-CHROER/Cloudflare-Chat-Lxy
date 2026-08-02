// 管理员禁言 API — /api/admin/mute / unmute / mute-list
// 转发到 RoomRegistry 的 handleMute，权限校验在 admin.mjs 完成
export async function handleAdminMute(path, request, env, url) {
  let registryId = env.registry.idFromName("global");
  let stub = env.registry.get(registryId);
  // M15：转发带 auth（admin.mjs 已注入 url.auth），registry 守卫校验
  let auth = encodeURIComponent(url.searchParams.get("auth") || "");

  if (path[1] === "mute" && request.method === "POST") {
    let body = await request.json().catch(() => ({}));
    body.mutedBy = body.mutedBy || url.searchParams.get("operator") || "";
    let r = await stub.fetch("https://dummy-url/admin/mute?auth=" + auth, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {"Content-Type": "application/json"}
    });
    let text = await r.text();
    return new Response(text, {status: r.status, headers: {"Content-Type": "application/json"}});
  }

  if (path[1] === "unmute" && request.method === "POST") {
    let body = await request.json().catch(() => ({}));
    let r = await stub.fetch("https://dummy-url/admin/unmute?auth=" + auth, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {"Content-Type": "application/json"}
    });
    let text = await r.text();
    return new Response(text, {status: r.status, headers: {"Content-Type": "application/json"}});
  }

  if (path[1] === "mute-list") {
    let r = await stub.fetch("https://dummy-url/admin/mute-list?auth=" + auth);
    let text = await r.text();
    return new Response(text, {status: r.status, headers: {"Content-Type": "application/json"}});
  }

  return new Response(JSON.stringify({error: "未找到操作"}), {status: 404, headers: {"Content-Type": "application/json"}});
}
