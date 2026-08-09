// 💱 v1.47 交易市场管理 API — 转发 registry /admin/market/*（auth 已由 api/admin 注入）
// 路径形态：/api/admin/market/config → /admin/market/config
//           /api/admin/market/orders → /admin/market/orders
//           /api/admin/market/delist → /admin/market/delist
// 🔒 L1 脱敏：整体 try/catch，异常只回 500"市场服务暂时不可用"，不泄露内部错误详情。

export async function handleAdminMarket(path, request, env, url) {
  if (path[1] !== "market") return null;
  const action = path[2];
  const auth = encodeURIComponent(url.searchParams.get("auth") || "");
  const jsonRes = (obj, status = 200) => new Response(JSON.stringify(obj), {status, headers: {"Content-Type": "application/json"}});
  try {
    let registryStub = env.registry.get(env.registry.idFromName("global"));
    if (action === "config") {
      if (request.method === "GET") {
        let r = await registryStub.fetch(new URL("https://dummy-url/admin/market/config?auth=" + auth));
        return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
      }
      if (request.method === "POST") {
        let body = await request.json();
        let r = await registryStub.fetch(new URL("https://dummy-url/admin/market/config?auth=" + auth), {
          method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}
        });
        return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
      }
      return jsonRes({error: "请使用GET或POST"}, 405);
    }
    if (action === "orders") {
      // 保留 auth 之外的 query（status/limit/offset 过滤/分页）
      let qs = new URLSearchParams(url.search);
      qs.delete("auth");
      let rest = qs.toString();
      let r = await registryStub.fetch(new URL("https://dummy-url/admin/market/orders?auth=" + auth + (rest ? "&" + rest : "")));
      return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
    }
    if (action === "delist") {
      if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
      let body = await request.json();
      let r = await registryStub.fetch(new URL("https://dummy-url/admin/market/delist?auth=" + auth), {
        method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}
      });
      return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
    }
    return null;
  } catch (e) {
    return jsonRes({error: "市场服务暂时不可用"}, 500);
  }
}
