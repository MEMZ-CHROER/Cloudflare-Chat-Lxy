// 管理后台 - 房间 Webhook 管理（list/gen/del/status）
// 转发 registry /room/webhook（registry.mjs adminExactPaths 已统一鉴权）

export async function handleAdminWebhooks(path, request, env, url) {
  // path 结构：["admin", "webhook", "list"] 或 ["admin", "webhook", "gen", "room"]
  const action = path[2];
  let rid = env.registry.idFromName("global");
  let stub = env.registry.get(rid);
  let auth = url.searchParams.get("auth") || "";

  if (action === "list") {
    let resp = await stub.fetch(new URL("https://dummy-url/room/webhook?action=list&auth=" + encodeURIComponent(auth)));
    return new Response(await resp.text(), {status: resp.status, headers: {"Content-Type": "application/json"}});
  }

  if (action === "gen" || action === "del" || action === "status") {
    const roomName = path[3];
    if (!roomName) return new Response(JSON.stringify({error: "请提供房间名"}), {status: 400, headers: {"Content-Type": "application/json"}});
    let resp = await stub.fetch(new URL("https://dummy-url/room/webhook?action=" + action + "&room=" + encodeURIComponent(roomName) + "&auth=" + encodeURIComponent(auth)));
    return new Response(await resp.text(), {status: resp.status, headers: {"Content-Type": "application/json"}});
  }

  return null;
}
