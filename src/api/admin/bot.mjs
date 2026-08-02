// 管理后台Bot命令操作

export async function handleAdminBot(path, request, env, url) {
  if (path[1] !== "bot") return null;

  try {
    let registryId = env.registry.idFromName("global");
    let registryStub = env.registry.get(registryId);
    let action = url.searchParams.get("action") || "list";
    // 🔒 L4 修复：action 白名单校验，防止任意字符串拼进 registry bot-commands 转发
    const ALLOWED_BOT_ACTIONS = ["add", "update", "delete", "list", "get"];
    if (!ALLOWED_BOT_ACTIONS.includes(action)) {
      return new Response(JSON.stringify({error: "无效操作"}), {status: 400, headers: {"Content-Type": "application/json"}});
    }
    // M15：registry 对 add/update/delete 做守卫，统一带 auth
    let registryUrl = "https://dummy-url/bot-commands?action=" + encodeURIComponent(action) + "&auth=" + encodeURIComponent(url.searchParams.get("auth") || "");
    if (action === "delete" || action === "get") {
      let keyword = url.searchParams.get("keyword");
      if (keyword) registryUrl += "&keyword=" + encodeURIComponent(keyword);
    }
    if (action === "add" || action === "update") {
      let r = await registryStub.fetch(registryUrl, {method: "POST", body: await request.text(), headers: {"Content-Type": "application/json"}});
      return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
    }
    let r = await registryStub.fetch(registryUrl);
    return new Response(await r.text(), {status: 200, headers: {"Content-Type": "application/json"}});
  } catch (error) {
    return new Response(JSON.stringify({error: "操作失败"}), {status: 500});
  }
}
