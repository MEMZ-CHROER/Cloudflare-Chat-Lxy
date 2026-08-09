// 🧪 v1.50 LuckPerms 权限系统网页编辑器 API — 转发 registry /lp/*（auth 已由 api/admin 注入）
// 路径形态：/api/admin/lp/data → /lp/data?auth=xxx   （读全量：组+用户+权限）
//           /api/admin/lp/exec → /lp/exec?auth=xxx     （写：执行 /lp 命令字符串）
// 🔒 L1 脱敏：整体 try/catch，异常只回 500"权限系统暂时不可用"，不泄露内部错误详情。
// 🔒 super-only：admin.mjs 中 path[1]==="lp" 不加入 adminAllowedPaths，普通 admin 在上方 403。

export async function handleAdminLp(path, request, env, url) {
  if (path[1] !== "lp") return null;
  const action = path[2];
  const auth = encodeURIComponent(url.searchParams.get("auth") || "");
  const jsonRes = (obj, status = 200) => new Response(JSON.stringify(obj), {status, headers: {"Content-Type": "application/json"}});
  try {
    let registryStub = env.registry.get(env.registry.idFromName("global"));
    if (action === "data") {
      if (request.method !== "GET") return jsonRes({error: "请使用GET"}, 405);
      let r = await registryStub.fetch(new URL("https://dummy-url/lp/data?auth=" + auth));
      return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
    }
    if (action === "exec") {
      if (request.method !== "POST") return jsonRes({error: "请使用POST"}, 405);
      let body = await request.json();
      let r = await registryStub.fetch(new URL("https://dummy-url/lp/exec?auth=" + auth), {
        method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}
      });
      return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
    }
    return null;
  } catch (e) {
    return jsonRes({error: "权限系统暂时不可用"}, 500);
  }
}
