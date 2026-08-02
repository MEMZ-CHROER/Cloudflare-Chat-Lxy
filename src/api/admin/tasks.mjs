// 管理后台任务操作

export async function handleAdminTasks(path, request, env, url) {
  if (path[1] !== "tasks") return null;

  const taskAction = path[2];
  try {
    let registryId = env.registry.idFromName("global");
    let registryStub = env.registry.get(registryId);
    // M15：转发带 auth（admin.mjs 已注入 url.auth），registry 守卫校验
    let auth = encodeURIComponent(url.searchParams.get("auth") || "");

    if (taskAction === "list") {
      let r = await registryStub.fetch(new URL("https://dummy-url/admin/tasks/list?auth=" + auth));
      return new Response(await r.text(), { status: 200, headers: {"Content-Type": "application/json"} });
    }
    if (taskAction === "task" && path[3] === "add") {
      if (request.method !== "POST") return new Response("方法不允许", {status: 405});
      let body = await request.json();
      let r = await registryStub.fetch("https://dummy-url/admin/task/add?auth=" + auth, {method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}});
      return new Response(await r.text(), { status: r.status });
    }
    if (taskAction === "task" && path[3] === "toggle") {
      if (request.method !== "POST") return new Response("方法不允许", {status: 405});
      let body = await request.json();
      let r = await registryStub.fetch("https://dummy-url/admin/task/toggle?auth=" + auth, {method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}});
      return new Response(await r.text(), { status: r.status });
    }
    if (taskAction === "task" && path[3] === "delete") {
      if (request.method !== "POST") return new Response("方法不允许", {status: 405});
      let body = await request.json();
      let r = await registryStub.fetch("https://dummy-url/admin/task/delete?auth=" + auth, {method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}});
      return new Response(await r.text(), { status: r.status });
    }
    return new Response("未找到该操作", { status: 404 });
  } catch (error) {
    return new Response("任务管理操作失败: " + "操作失败", { status: 500 });
  }
}
