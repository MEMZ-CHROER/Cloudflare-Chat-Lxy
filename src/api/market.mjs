// 💱 v1.47 交易市场 API — 转发 registry /market/*
// list 公开只读；inventory/orders 需 token（query 带 name+token，API 层先 user-check-auth 给友好 403）；
// sell/buy/cancel POST body 透传，API 层校验 token，registry 内再纵深校验。
// 🔒 L1 脱敏：整体 try/catch，异常只回 500"市场服务暂时不可用"，不泄露内部错误详情。

export async function handleMarket(path, request, env) {
  const url = new URL(request.url);
  const action = path[1];
  let rid = env.registry.idFromName("global");
  let stub = env.registry.get(rid);
  const jsonRes = (obj, status = 200) => new Response(JSON.stringify(obj), {status, headers: {"Content-Type": "application/json"}});
  try {
    if (action === "list") {
      // 公开只读：透传 query（limit/offset）
      let r = await stub.fetch(new URL("https://dummy-url/market/list?" + url.searchParams.toString()));
      return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
    }
    if (action === "inventory" || action === "orders") {
      let name = url.searchParams.get("name");
      let token = url.searchParams.get("token") || "";
      let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(name || "") + "&token=" + encodeURIComponent(token)));
      let authData = await authCheck.json();
      if (!authData.authenticated) return jsonRes({error: "请先登录"}, 403);
      let r = await stub.fetch(new URL("https://dummy-url/market/" + action + "?name=" + encodeURIComponent(name || "") + "&token=" + encodeURIComponent(token)));
      return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
    }
    if (action === "sell" || action === "buy" || action === "cancel") {
      if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
      let body = await request.json();
      let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(body.name || "") + "&token=" + encodeURIComponent(body.token || "")));
      let authData = await authCheck.json();
      if (!authData.authenticated) return jsonRes({error: "请先登录后再操作市场"}, 403);
      let r = await stub.fetch(new URL("https://dummy-url/market/" + action), {
        method: "POST",
        body: JSON.stringify(body),
        headers: {"Content-Type": "application/json"}
      });
      return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
    }
    return jsonRes({error: "未找到该操作"}, 404);
  } catch (e) {
    return jsonRes({error: "市场服务暂时不可用"}, 500);
  }
}
