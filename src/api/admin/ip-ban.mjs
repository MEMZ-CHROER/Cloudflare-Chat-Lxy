// 管理后台IP封禁操作

export async function handleAdminIpBan(path, request, env, url) {
  if (path[1] !== "ip-ban") return null;

  const action = path[2];
  const ip = url.searchParams.get("ip");

  try {
    let registryId = env.registry.idFromName("global");
    let registryStub = env.registry.get(registryId);
    // M15：转发带 auth（admin.mjs 已注入 url.auth），registry 守卫校验
    let auth = encodeURIComponent(url.searchParams.get("auth") || "");

    if (action === "add") {
      if (!ip) return new Response("请提供IP地址", { status: 400 });
      let response = await registryStub.fetch(new URL("https://dummy-url/ip-ban?ip=" + encodeURIComponent(ip) + "&auth=" + auth));
      return new Response(await response.text(), { status: response.status });
    } else if (action === "remove") {
      if (!ip) return new Response("请提供IP地址", { status: 400 });
      let response = await registryStub.fetch(new URL("https://dummy-url/ip-unban?ip=" + encodeURIComponent(ip) + "&auth=" + auth));
      return new Response(await response.text(), { status: response.status });
    } else if (action === "list") {
      let response = await registryStub.fetch(new URL("https://dummy-url/ip-banned-list"));
      let data = await response.json();
      return new Response(JSON.stringify(data), {
        status: 200, headers: {"Content-Type": "application/json"}
      });
    }

    return new Response("未找到该操作", { status: 404 });
  } catch (error) {
    return new Response("IP封禁操作失败: " + "操作失败", { status: 500 });
  }
}
