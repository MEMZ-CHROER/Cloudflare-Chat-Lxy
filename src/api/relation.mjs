// 👥 v1.48 关系链 API — 转发 registry /rel/*
// follow/unfollow/request/respond/unfriend/block/unblock POST body 透传，API 层先 user-check-auth 给友好 403；
// status/lists GET query 透传。blocked/at-filter 仅供 chatroom DO 内部直连，不暴露到 HTTP。
// 🔒 L1 脱敏：整体 try/catch，异常只回 500"关系链服务暂时不可用"，不泄露内部错误详情。

export async function handleRelation(path, request, env) {
  const url = new URL(request.url);
  const action = path[1];
  let rid = env.registry.idFromName("global");
  let stub = env.registry.get(rid);
  const jsonRes = (obj, status = 200) => new Response(JSON.stringify(obj), {status, headers: {"Content-Type": "application/json"}});
  const POST_ACTIONS = ["follow", "unfollow", "request", "respond", "unfriend", "block", "unblock"];
  try {
    if (POST_ACTIONS.includes(action)) {
      if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
      let body = await request.json();
      let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(body.name || "") + "&token=" + encodeURIComponent(body.token || "")));
      let authData = await authCheck.json();
      if (!authData.authenticated) return jsonRes({error: "请先登录后再操作"}, 403);
      let r = await stub.fetch(new URL("https://dummy-url/rel/" + action), {
        method: "POST",
        body: JSON.stringify(body),
        headers: {"Content-Type": "application/json"}
      });
      return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
    }
    if (action === "status" || action === "lists") {
      let name = url.searchParams.get("name");
      let token = url.searchParams.get("token") || "";
      let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(name || "") + "&token=" + encodeURIComponent(token)));
      let authData = await authCheck.json();
      if (!authData.authenticated) return jsonRes({error: "请先登录后再操作"}, 403);
      let r = await stub.fetch(new URL("https://dummy-url/rel/" + action + "?" + url.searchParams.toString()));
      return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
    }
    return jsonRes({error: "未找到该操作"}, 404);
  } catch (e) {
    return jsonRes({error: "关系链服务暂时不可用"}, 500);
  }
}
