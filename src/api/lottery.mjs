// 抽奖 API - 奖池查询、抽奖

export async function handleLottery(path, request, env) {
  const lotAction = path[1];
  try {
    let registryId = env.registry.idFromName("global");
    let stub = env.registry.get(registryId);
    if (lotAction === "pools") {
      let r = await stub.fetch(new URL("https://dummy-url/lottery/pools"));
      return new Response(await r.text(), {headers: {"Content-Type": "application/json"}});
    }
    if (lotAction === "draw") {
      if (request.method !== "POST") return new Response("方法不允许", {status: 405});
      let body = await request.json();
      // 🔒 安全修复：抽奖必须验证 token，杜绝越权扣他人积分/改他人库存
      let token = body.token || "";
      let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(body.name || "") + "&token=" + encodeURIComponent(token)));
      let authData = await authCheck.json();
      if (!authData.authenticated) {
        return new Response(JSON.stringify({error: "请先登录后再抽奖"}), {status: 403, headers: {"Content-Type": "application/json"}});
      }
      let r = await stub.fetch("https://dummy-url/lottery/draw", {method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}});
      return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
    }
    return new Response("未找到该操作", {status: 404});
  } catch (error) {
    // 🔒 L1 脱敏：不向客户端回传内部错误详情
    return new Response(JSON.stringify({error: "服务器内部错误"}), {status: 500});
  }
}
