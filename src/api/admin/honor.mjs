// 🪙 v1.45 荣誉币管理 API — 转发 registry /admin/honor/* 与 /admin/honor-shop/*（auth 已由 api/admin 注入）
// 路径形态：/api/admin/honor/add → /admin/honor/add
//           /api/admin/honor/honor-shop/items → /admin/honor-shop/items
//           /api/admin/honor/honor-shop/item/add → /admin/honor-shop/item/add

export async function handleAdminHonor(path, request, env, url) {
  if (path[1] !== "honor") return null;
  const action = path[2];
  const auth = encodeURIComponent(url.searchParams.get("auth") || "");
  try {
    let registryStub = env.registry.get(env.registry.idFromName("global"));
    if (action === "add") {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405, headers: {"Content-Type": "application/json"}});
      let body = await request.json();
      let r = await registryStub.fetch(new URL("https://dummy-url/admin/honor/add?auth=" + auth), {
        method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}
      });
      return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
    }
    if (action === "honor-shop") {
      const sub = path[3];
      if (sub === "items") {
        let r = await registryStub.fetch(new URL("https://dummy-url/admin/honor-shop/items?auth=" + auth));
        return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
      }
      if (sub === "item") {
        const op = path[4];
        if (!["add", "toggle", "delete"].includes(op)) return null;
        if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405, headers: {"Content-Type": "application/json"}});
        let body = await request.json();
        let r = await registryStub.fetch(new URL("https://dummy-url/admin/honor-shop/item/" + op + "?auth=" + auth), {
          method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}
        });
        return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
      }
    }
    return null;
  } catch (e) {
    return new Response(JSON.stringify({error: "荣誉服务暂时不可用"}), {status: 500, headers: {"Content-Type": "application/json"}});
  }
}
