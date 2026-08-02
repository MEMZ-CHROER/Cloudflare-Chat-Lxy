// 消息撤回 API — 需验证身份，防止任意撤回他人消息
// 管理员撤回走 /api/admin/message/recall（独立认证路径）

export async function handleRecall(path, request, env) {
  const url = new URL(request.url);
  const recallRoom = path[1];
  const recallTs = url.searchParams.get("timestamp");
  const recallName = url.searchParams.get("name");
  const recallToken = url.searchParams.get("token") || "";
  if (!recallRoom || !recallTs || !recallName) return new Response("缺少参数", {status: 400});

  // 验证用户身份：token 必须匹配
  try {
    let registryId = env.registry.idFromName("global");
    let stub = env.registry.get(registryId);
    let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(recallName) + "&token=" + encodeURIComponent(recallToken)));
    let authData = await authCheck.json();
    if (!authData.authenticated) {
      return new Response("撤回失败：请先登录", {status: 403});
    }
  } catch (e) {
    return new Response("撤回失败：验证服务不可用", {status: 503});
  }

  // M5 修复：密码房撤回需提供正确密码（复制 rooms.mjs requireRoomPassword 逻辑，fail-closed）
  try {
    let registryId = env.registry.idFromName("global");
    let stub = env.registry.get(registryId);
    let pResp = await stub.fetch("https://dummy-url/password-status?name=" + encodeURIComponent(recallRoom));
    let pData = await pResp.json();
    if (pData.hasPassword) {
      let pwd = url.searchParams.get("password") || "";
      let vResp = await stub.fetch("https://dummy-url/verify-password", {
        method: "POST", body: JSON.stringify({name: recallRoom, password: pwd}), headers: {"Content-Type": "application/json"}
      });
      let vData = await vResp.json();
      if (!vData.ok) return new Response("撤回失败：需要正确的房间密码", {status: 403});
    }
  } catch (e) {
    return new Response("撤回失败：验证服务不可用", {status: 503});
  }

  let recallId;
  if (recallRoom.match(/^[0-9a-f]{64}$/)) {
    recallId = env.rooms.idFromString(recallRoom);
  } else if (recallRoom.length <= 32) {
    recallId = env.rooms.idFromName(recallRoom);
  } else {
    return new Response("房间名称/ID格式不正确。", { status: 400 });
  }

  try {
    let roomObj = env.rooms.get(recallId);
    let resp = await roomObj.fetch(new URL("https://dummy-url/message/recall?timestamp=" + encodeURIComponent(recallTs) + "&name=" + encodeURIComponent(recallName)));
    let text = await resp.text();
    return new Response(text, {status: resp.status});
  } catch (error) {
    return new Response("撤回失败：服务器内部错误", { status: 500 });
  }
}
