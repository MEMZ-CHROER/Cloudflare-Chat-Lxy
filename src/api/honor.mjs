// 🪙 v1.45 荣誉币 API — 转发 registry /honor/*（get/ledger 公开只读+token；shop/items 公开；shop/buy POST body 透传，registry 内校验 token）

export async function handleHonorApi(path, request, env) {
  const url = new URL(request.url);
  const action = path[1];
  let rid = env.registry.idFromName("global");
  let stub = env.registry.get(rid);
  if (action === "get") {
    let name = url.searchParams.get("name");
    if (!name) return new Response(JSON.stringify({honor: "0"}), {headers: {"Content-Type": "application/json"}});
    let r = await stub.fetch(new URL("https://dummy-url/honor/get?name=" + encodeURIComponent(name)));
    return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
  }
  if (action === "ledger") {
    let name = url.searchParams.get("name");
    let token = url.searchParams.get("token") || "";
    let limit = url.searchParams.get("limit") || 50;
    if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400, headers: {"Content-Type": "application/json"}});
    let r = await stub.fetch(new URL("https://dummy-url/honor/ledger?name=" + encodeURIComponent(name) + "&token=" + encodeURIComponent(token) + "&limit=" + limit));
    return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
  }
  if (action === "shop" && path[2] === "items") {
    let r = await stub.fetch(new URL("https://dummy-url/honor/shop/items"));
    return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
  }
  if (action === "shop" && path[2] === "buy") {
    if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405, headers: {"Content-Type": "application/json"}});
    let body = await request.json();
    let r = await stub.fetch(new URL("https://dummy-url/honor/shop/buy"), {
      method: "POST",
      body: JSON.stringify(body),
      headers: {"Content-Type": "application/json"}
    });
    return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
  }
  return new Response("未找到该操作", { status: 404 });
}
