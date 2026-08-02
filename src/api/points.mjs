// 积分 API - 转账、查询
// 重要：转账操作要求 sender 提供 token 验证身份，防止任意盗转积分

export async function handlePoints(path, request, env) {
  const url = new URL(request.url);
  const action = path[1];
  if (action === "get") {
    let name = url.searchParams.get("name");
    if (!name) return new Response(JSON.stringify({points: 0}), {headers: {"Content-Type": "application/json"}});
    let registryId = env.registry.idFromName("global");
    let stub = env.registry.get(registryId);
    let r = await stub.fetch(new URL("https://dummy-url/points/get?name=" + encodeURIComponent(name)));
    return new Response(await r.text(), {headers: {"Content-Type": "application/json"}});
  }
  if (action === "transfer") {
    let sender = url.searchParams.get("sender");
    let receiver = url.searchParams.get("receiver");
    let amount = url.searchParams.get("amount");
    let token = url.searchParams.get("token") || "";
    if (!sender || !receiver || !amount) {
      return new Response("请提供 sender、receiver 和 amount", { status: 400 });
    }
    // M2 修复：金额必须为正整数（防负转账/大指数 DoS，registry 层另有 amount<=0n 兜底）
    if (!/^[1-9]\d*$/.test(amount)) {
      return new Response("金额必须为正整数", { status: 400 });
    }
    try {
      let registryId = env.registry.idFromName("global");
      let stub = env.registry.get(registryId);
      // 验证 sender 身份：查询注册用户 token 是否匹配
      let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(sender) + "&token=" + encodeURIComponent(token)));
      let authData = await authCheck.json();
      if (!authData.authenticated) {
        return new Response("转账失败：请先登录并验证身份", { status: 403 });
      }
      let r = await stub.fetch(new URL("https://dummy-url/points/transfer?sender=" + encodeURIComponent(sender) + "&receiver=" + encodeURIComponent(receiver) + "&amount=" + encodeURIComponent(amount)));
      return new Response(await r.text(), { status: r.status });
    } catch (error) {
      // 🔒 L1 脱敏：不向客户端回传内部错误详情
      return new Response("转账失败: 服务器内部错误", { status: 500 });
    }
  }
  if (action === "all") {
    // 积分排行榜（公开只读）：供房间列表积分徽章 / 商城 / 任务 / leaderboard / stats 展示。
    // 说明：v1.21 曾收紧为需管理密钥，导致前端所有积分展示回归（updatePointsDisplay/shop/tasks/leaderboard/stats 全 403）。
    // 积分是游戏经济数据、排行榜页面本就公开，故恢复公开只读；所有积分写操作仍走 registry 密钥校验（见 transfer 分支）。
    try {
      let registryId = env.registry.idFromName("global");
      let stub = env.registry.get(registryId);
      let r = await stub.fetch(new URL("https://dummy-url/points/all"));
      return new Response(await r.text(), { status: 200, headers: {"Content-Type": "application/json"} });
    } catch (error) {
      // 🔒 L1 脱敏：不向客户端回传内部错误详情
      return new Response("获取积分失败: 服务器内部错误", { status: 500 });
    }
  }
  if (action === "ledger") {
    // 💰 积分流水账本：M3 修复——需本人 token 验证（防公开 IDOR 泄露财务），前端 /ledger 命令已带 token
    let name = url.searchParams.get("name");
    let token = url.searchParams.get("token") || "";
    let limit = url.searchParams.get("limit") || 50;
    if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400, headers: {"Content-Type": "application/json"}});
    try {
      let registryId = env.registry.idFromName("global");
      let stub = env.registry.get(registryId);
      let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(name) + "&token=" + encodeURIComponent(token)));
      let authData = await authCheck.json();
      if (!authData.authenticated) {
        return new Response(JSON.stringify({error: "请先登录后查看流水"}), {status: 403, headers: {"Content-Type": "application/json"}});
      }
      let r = await stub.fetch(new URL("https://dummy-url/points/ledger?name=" + encodeURIComponent(name) + "&limit=" + limit));
      return new Response(await r.text(), {status: 200, headers: {"Content-Type": "application/json"}});
    } catch (error) {
      // 🔒 L1 脱敏：不向客户端回传内部错误详情
      return new Response(JSON.stringify({error: "获取流水失败: 服务器内部错误"}), {status: 500, headers: {"Content-Type": "application/json"}});
    }
  }
  return new Response("未找到该操作", { status: 404 });
}
