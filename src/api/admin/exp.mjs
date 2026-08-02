// 管理后台经验等级操作

export async function handleAdminExp(path, request, env, url) {
  if (path[1] !== "exp") return null;

  const action = path[2];
  const name = url.searchParams.get("name");
  try {
    let registryId = env.registry.idFromName("global");
    let registryStub = env.registry.get(registryId);

    if (action === "get") {
      if (!name) return new Response("请提供用户名", { status: 400 });
      let r = await registryStub.fetch(new URL("https://dummy-url/exp/get?name=" + encodeURIComponent(name)));
      return new Response(await r.text(), { status: r.status, headers: {"Content-Type": "application/json"} });
    }

    if (action === "set" || action === "add") {
      if (!name) return new Response("请提供用户名", { status: 400 });
      let amount = url.searchParams.get("exp") || url.searchParams.get("amount");
      if (!amount) return new Response("请提供经验值", { status: 400 });
      // 🔒 安全修复（E5/M15）：附带管理密钥作为 registry 内部校验凭证
      // 🔒 安全修复（LD12）：URL 无 key 时从 httpOnly Cookie 读取管理密钥作 registry auth 校验
      let ak = url.searchParams.get("key") || "";
      if (!ak) {
        let m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)admin_key=([^;]+)/);
        if (m) { try { ak = decodeURIComponent(m[1]); } catch (_) { ak = m[1]; } }
      }
      let auth = encodeURIComponent(ak);
      let param = action === "set" ? "exp" : "amount";
      let r = await registryStub.fetch(new URL("https://dummy-url/exp/" + action + "?name=" + encodeURIComponent(name) + "&" + param + "=" + encodeURIComponent(amount) + "&auth=" + auth));
      return new Response(await r.text(), { status: r.status, headers: {"Content-Type": "application/json"} });
    }

    if (action === "all") {
      let r = await registryStub.fetch(new URL("https://dummy-url/exp/all"));
      return new Response(await r.text(), { status: 200, headers: {"Content-Type": "application/json"} });
    }

    if (action === "batch") {
      let names = url.searchParams.get("names");
      let raw = url.searchParams.get("exp") || url.searchParams.get("amount");
      let batchAction = url.searchParams.get("action") || "add";
      if (!names) return new Response("请提供用户名列表", { status: 400 });
      if (!raw) return new Response("请提供经验值", { status: 400 });
      // 🔒 安全修复（E5/M15）：附带管理密钥作为 registry 内部校验凭证
      let ak = url.searchParams.get("key") || "";
      if (!ak) {
        let m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)admin_key=([^;]+)/);
        if (m) { try { ak = decodeURIComponent(m[1]); } catch (_) { ak = m[1]; } }
      }
      let auth = encodeURIComponent(ak);
      let param = batchAction === "set" ? "exp" : "amount";
      let r = await registryStub.fetch(new URL("https://dummy-url/exp/batch?names=" + encodeURIComponent(names) + "&" + param + "=" + encodeURIComponent(raw) + "&action=" + encodeURIComponent(batchAction) + "&auth=" + auth));
      return new Response(await r.text(), { status: r.status, headers: {"Content-Type": "application/json"} });
    }

    return new Response("未找到该操作", { status: 404 });
  } catch (error) {
    return new Response("经验操作失败: " + "操作失败", { status: 500 });
  }
}
