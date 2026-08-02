// 商城 API - 商品列表、背包、购买、装备、卸下

export async function handleShop(path, request, env) {
  const shopAction = path[1];
  try {
    let registryId = env.registry.idFromName("global");
    let stub = env.registry.get(registryId);
    let url = new URL(request.url);

    if (shopAction === "items") {
      let r = await stub.fetch(new URL("https://dummy-url/shop/items"));
      return new Response(await r.text(), { status: 200, headers: {"Content-Type": "application/json"} });
    }
    if (shopAction === "inventory") {
      let name = url.searchParams.get("name");
      if (!name) return new Response("请提供用户名", { status: 400 });
      let r = await stub.fetch(new URL("https://dummy-url/shop/inventory?name=" + encodeURIComponent(name)));
      return new Response(await r.text(), { status: 200, headers: {"Content-Type": "application/json"} });
    }
    if (shopAction === "buy" || shopAction === "equip" || shopAction === "unequip") {
      if (request.method !== "POST") return new Response("方法不允许", {status: 405});
      let body = await request.json();
      // 🔒 S4 修复：所有写操作必须验证 token，杜绝越权操作任意用户名
      let token = body.token || "";
      let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(body.name || "") + "&token=" + encodeURIComponent(token)));
      let authData = await authCheck.json();
      if (!authData.authenticated) {
        return new Response(JSON.stringify({error: "请先登录后再操作商城"}), {status: 403, headers: {"Content-Type": "application/json"}});
      }
      let r = await stub.fetch("https://dummy-url/shop/" + shopAction, {method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}});
      let result = await r.text();
      if ((shopAction === "equip" || shopAction === "unequip") && r.status === 200) {
        try {
          let data = JSON.parse(result);
          if (data.tag !== undefined) {
            let registryStub = stub;
            let roomsResponse = await registryStub.fetch(new URL("https://dummy-url/list"));
            let rooms = await roomsResponse.json();
            for (let [roomName] of Object.entries(rooms)) {
              let id;
              if (roomName.match(/^[0-9a-f]{64}$/)) {
                id = env.rooms.idFromString(roomName);
              } else if (roomName.length <= 32) {
                id = env.rooms.idFromName(roomName);
              } else continue;
              let roomObject = env.rooms.get(id);
              await roomObject.fetch(new URL("https://dummy-url/tag-update?name=" + encodeURIComponent(body.name || "") + "&tag=" + encodeURIComponent(data.tag) + "&color=" + encodeURIComponent(data.color) + "&border=" + encodeURIComponent(data.border || "")));
            }
          }
        } catch (e) {}
      }
      return new Response(result, { status: r.status, headers: {"Content-Type": "application/json"} });
    }
    return new Response("未找到该操作", { status: 404 });
  } catch (error) {
    // 🔒 L1 脱敏：不向客户端回传内部错误详情
    return new Response("商城操作失败: 服务器内部错误", { status: 500 });
  }
}
