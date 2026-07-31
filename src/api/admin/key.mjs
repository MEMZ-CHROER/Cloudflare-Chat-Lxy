// 管理后台管理密钥操作

export async function handleAdminKey(path, request, env, url) {
  if (path[1] !== "admin-key") return null;

  const akAction = path[2];

  try {
    let registryId = env.registry.idFromName("global");
    let registryStub = env.registry.get(registryId);

    if (akAction === "get") {
      let response = await registryStub.fetch(new URL("https://dummy-url/admin-key/get"));
      let data = await response.json();
      return new Response(JSON.stringify(data), {
        status: 200, headers: {"Content-Type": "application/json"}
      });
    } else if (akAction === "set") {
      const newKey = url.searchParams.get("newkey");
      if (!newKey) return new Response("请提供新密钥（?newkey=xxx）", { status: 400 });
      let response = await registryStub.fetch(new URL("https://dummy-url/admin-key/set?key=" + encodeURIComponent(newKey)));
      return new Response(await response.text(), { status: response.status });
    } else if (akAction === "reset") {
      let response = await registryStub.fetch(new URL("https://dummy-url/admin-key/reset?default=" + encodeURIComponent(env.ADMIN_KEY || "")));
      return new Response(await response.text(), { status: response.status });
    }

    return new Response("未找到该操作", { status: 404 });
  } catch (error) {
    return new Response("管理密钥操作失败: " + "操作失败", { status: 500 });
  }
}
