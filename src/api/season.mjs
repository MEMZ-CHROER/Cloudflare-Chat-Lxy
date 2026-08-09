// 🏆 v1.45 赛季 API — 转发 registry /season/*（status 公开，progress 带 name+token）

export async function handleSeasonApi(path, request, env) {
  const url = new URL(request.url);
  const action = path[1];
  let rid = env.registry.idFromName("global");
  let stub = env.registry.get(rid);
  if (action === "status") {
    let r = await stub.fetch(new URL("https://dummy-url/season/status"));
    return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
  }
  if (action === "progress") {
    let name = url.searchParams.get("name");
    let token = url.searchParams.get("token") || "";
    if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400, headers: {"Content-Type": "application/json"}});
    let r = await stub.fetch(new URL("https://dummy-url/season/progress?name=" + encodeURIComponent(name) + "&token=" + encodeURIComponent(token)));
    return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
  }
  return new Response("未找到该操作", { status: 404 });
}
