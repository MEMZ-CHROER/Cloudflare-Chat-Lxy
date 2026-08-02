// 兑换码 API — 用户兑换
export async function handleRedeemApi(path, request, env) {
  const url = new URL(request.url);
  try {
    let registryId = env.registry.idFromName("global");
    let stub = env.registry.get(registryId);

    if (request.method === "POST") {
      let body = await request.json();
      // 🔒 安全修复：兑换必须验证 token，杜绝冒名兑换/刷积分
      let token = body.token || "";
      let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(body.user || "") + "&token=" + encodeURIComponent(token)));
      let authData = await authCheck.json();
      if (!authData.authenticated) {
        return new Response(JSON.stringify({error: "请先登录后再兑换"}), {status: 403, headers: {"Content-Type": "application/json"}});
      }
      let r = await stub.fetch("https://dummy-url/redeem/redeem", {
        method: "POST",
        body: JSON.stringify(body),
        headers: {"Content-Type": "application/json"}
      });
      return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
    }
    return new Response("未找到", {status: 404});
  } catch (error) {
    // 🔒 L1 脱敏：不向客户端回传内部错误详情
    return new Response(JSON.stringify({error: "服务器内部错误"}), {status: 500});
  }
}
