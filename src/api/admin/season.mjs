// 🏆 v1.45 赛季管理 API — 转发 registry /admin/season/*（auth 已由 api/admin 注入，body 透传）

export async function handleAdminSeason(path, request, env, url) {
  if (path[1] !== "season") return null;
  const action = path[2];
  if (!["create", "start", "end", "config"].includes(action)) return null;
  const auth = encodeURIComponent(url.searchParams.get("auth") || "");
  try {
    let registryStub = env.registry.get(env.registry.idFromName("global"));
    if (action === "config") {
      let r = await registryStub.fetch(new URL("https://dummy-url/admin/season/config?auth=" + auth));
      return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
    }
    if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405, headers: {"Content-Type": "application/json"}});
    let body = await request.json();
    let r = await registryStub.fetch(new URL("https://dummy-url/admin/season/" + action + "?auth=" + auth), {
      method: "POST",
      body: JSON.stringify(body),
      headers: {"Content-Type": "application/json"}
    });
    return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
  } catch (e) {
    return new Response(JSON.stringify({error: "赛季服务暂时不可用"}), {status: 500, headers: {"Content-Type": "application/json"}});
  }
}
