// 管理后台抽奖操作
// ⚠️ 重要：所有操作必须通过白名单验证，防止路径遍历攻击

const ALLOWED_LOTTERY_ACTIONS = new Set([
  "pools", "pool/create", "pool/update", "pool/toggle", "pool/delete",
  "prize/create", "prize/update", "prize/delete", "prize/restock"
]);

export async function handleAdminLottery(path, request, env, url) {
  if (path[1] !== "lottery") return null;

  try {
    let registryId = env.registry.idFromName("global");
    let stub = env.registry.get(registryId);
    // M15：转发带 auth（admin.mjs 已注入 url.auth），registry 守卫校验
    let auth = encodeURIComponent(url.searchParams.get("auth") || "");
    const lotAction = path.slice(2).join("/");

    // 白名单验证：防止路径遍历攻击（如 ../../../admin-key/get）
    if (!ALLOWED_LOTTERY_ACTIONS.has(lotAction)) {
      return new Response(JSON.stringify({error: "未找到"}), {status: 404});
    }

    if (lotAction === "pools") {
      let r = await stub.fetch(new URL("https://dummy-url/lottery/admin/pools?auth=" + auth));
      return new Response(await r.text(), {headers: {"Content-Type": "application/json"}});
    }
    let registryUrl = "https://dummy-url/lottery/admin/" + lotAction + "?auth=" + auth;
    let r = await stub.fetch(registryUrl, {method: request.method, body: request.method === "POST" ? await request.text() : undefined, headers: {"Content-Type": "application/json"}});
    return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
  } catch (error) {
    console.error("抽奖管理操作失败:", error);
    return new Response(JSON.stringify({error: "操作失败"}), {status: 500});
  }
}
