// 任务 API - 任务列表、完成记录、领取、完成

export async function handleTasks(path, request, env) {
  const url = new URL(request.url);
  const taskAction = path[1];
  try {
    let registryId = env.registry.idFromName("global");
    let stub = env.registry.get(registryId);

    if (taskAction === "list") {
      let r = await stub.fetch(new URL("https://dummy-url/tasks/list"));
      return new Response(await r.text(), { status: 200, headers: {"Content-Type": "application/json"} });
    }
    if (taskAction === "completions") {
      let name = url.searchParams.get("name");
      if (!name) return new Response("请提供用户名", { status: 400 });
      let r = await stub.fetch(new URL("https://dummy-url/tasks/completions?name=" + encodeURIComponent(name)));
      return new Response(await r.text(), { status: 200, headers: {"Content-Type": "application/json"} });
    }
    if (taskAction === "claims") {
      let name = url.searchParams.get("name");
      if (!name) return new Response("请提供用户名", { status: 400 });
      let r = await stub.fetch(new URL("https://dummy-url/tasks/claims?name=" + encodeURIComponent(name)));
      return new Response(await r.text(), { status: 200, headers: {"Content-Type": "application/json"} });
    }
    if (taskAction === "claim" || taskAction === "complete") {
      if (request.method !== "POST") return new Response("方法不允许", {status: 405});
      let body = await request.json();
      // 🔒 S4 修复：所有写操作必须验证 token，杜绝越权操作任意用户名
      let token = body.token || "";
      let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(body.name || "") + "&token=" + encodeURIComponent(token)));
      let authData = await authCheck.json();
      if (!authData.authenticated) {
        return new Response(JSON.stringify({error: "请先登录后再操作任务"}), {status: 403, headers: {"Content-Type": "application/json"}});
      }
      let target = taskAction === "claim" ? "/task/claim" : "/task/complete";
      let r = await stub.fetch("https://dummy-url" + target, {method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}});
      return new Response(await r.text(), { status: r.status, headers: {"Content-Type": "application/json"} });
    }
    return new Response("未找到该操作", { status: 404 });
  } catch (error) {
    // 🔒 L1 脱敏：不向客户端回传内部错误详情
    return new Response("任务操作失败: 服务器内部错误", { status: 500 });
  }
}
