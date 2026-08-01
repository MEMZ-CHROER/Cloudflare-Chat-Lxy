// 管理后台积分操作

export async function handleAdminPoints(path, request, env, url) {
  if (path[1] !== "points") return null;

  const action = path[2];
  const name = url.searchParams.get("name");
  try {
    let registryId = env.registry.idFromName("global");
    let registryStub = env.registry.get(registryId);

    if (action === "get") {
      if (!name) return new Response("请提供用户名", { status: 400 });
      let r = await registryStub.fetch(new URL("https://dummy-url/points/get?name=" + encodeURIComponent(name)));
      return new Response(await r.text(), { status: r.status, headers: {"Content-Type": "application/json"} });
    }
    if (action === "set" || action === "add") {
      if (!name) return new Response("请提供用户名", { status: 400 });
      let amount = url.searchParams.get("amount");
      if (!amount) return new Response("请提供积分数量", { status: 400 });
      // 🔒 安全修复（E5）：附带管理密钥作为 registry 内部校验凭证
      let auth = encodeURIComponent(url.searchParams.get("key") || "");
      let r = await registryStub.fetch(new URL("https://dummy-url/points/" + action + "?name=" + encodeURIComponent(name) + "&amount=" + encodeURIComponent(amount) + "&auth=" + auth));
      return new Response(await r.text(), { status: r.status });
    }
    if (action === "all") {
      let r = await registryStub.fetch(new URL("https://dummy-url/points/all"));
      return new Response(await r.text(), { status: 200, headers: {"Content-Type": "application/json"} });
    }
    if (action === "batch") {
      let names = url.searchParams.get("names");
      let amount = url.searchParams.get("amount");
      let batchAction = url.searchParams.get("action") || "add";
      if (!names) return new Response("请提供用户名列表", { status: 400 });
      if (!amount) return new Response("请提供积分数量", { status: 400 });
      // 🔒 安全修复（E5）：附带管理密钥作为 registry 内部校验凭证
      let auth = encodeURIComponent(url.searchParams.get("key") || "");
      let r = await registryStub.fetch(new URL("https://dummy-url/points/batch?names=" + encodeURIComponent(names) + "&amount=" + encodeURIComponent(amount) + "&action=" + encodeURIComponent(batchAction) + "&auth=" + auth));
      return new Response(await r.text(), { status: r.status });
    }
    return new Response("未找到该操作", { status: 404 });
  } catch (error) {
    return new Response("积分操作失败: " + "操作失败", { status: 500 });
  }
}
