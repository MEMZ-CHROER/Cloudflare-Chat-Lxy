// 版本存档 API — /api/archive/*
export async function handleArchive(apiPath, request, env) {
  // apiPath = ["archive", "upload"] or ["archive", "list"], etc.
  if (!env.archive) {
    return new Response(JSON.stringify({error: "版本存档系统未启用"}), {status: 503, headers: {"Content-Type": "application/json"}});
  }

  let id = env.archive.idFromName("archive");
  let stub = env.archive.get(id);

  // 去掉开头的 "archive"
  let subPath = apiPath.slice(1); // ["upload"], ["list"], ["download"], ["delete"]

  if (subPath[0] === "upload") {
    // 需要管理员验证 — 走 admin.mjs 相同的逻辑
    let key = request.headers.get("X-Admin-Key") || new URL(request.url).searchParams.get("key") || "";
    if (!key) return new Response(JSON.stringify({error: "需要管理密钥"}), {status: 401, headers: {"Content-Type": "application/json"}});

    let permission = null;
    if (key === (env.ADMIN_SECRET_KEY || "del")) permission = "super";
    if (!permission && key === (env.ADMIN_KEY || "mod")) permission = "admin";
    if (!permission) {
      try {
        let registryId = env.registry.idFromName("global");
        let registryStub = env.registry.get(registryId);
        let authResp = await registryStub.fetch("https://dummy-url/combined-auth?key=" + encodeURIComponent(key));
        let auth = await authResp.json();
        if (auth.level) permission = auth.level;
      } catch (_) {}
    }
    if (!permission) {
      return new Response(JSON.stringify({error: "密钥无效"}), {status: 403, headers: {"Content-Type": "application/json"}});
    }

    let name = new URL(request.url).searchParams.get("name");
    let description = new URL(request.url).searchParams.get("description") || "";
    if (!name) return new Response(JSON.stringify({error: "请提供版本名称"}), {status: 400, headers: {"Content-Type": "application/json"}});

    // 转发整个 body 到 DO
    let doResp = await stub.fetch("https://dummy-url/upload?name=" + encodeURIComponent(name) + "&description=" + encodeURIComponent(description), {
      method: "POST",
      body: request.body,
      headers: {"Content-Type": "application/octet-stream"}
    });
    return new Response(await doResp.text(), {status: doResp.status, headers: {"Content-Type": "application/json"}});
  }

  if (subPath[0] === "list") {
    let doResp = await stub.fetch("https://dummy-url/list");
    return new Response(await doResp.text(), {status: 200, headers: {"Content-Type": "application/json"}});
  }

  if (subPath[0] === "download") {
    // 下载公开：存档列表页是公开的，历史版本 zip 也应可公开下载（无需管理密钥）
    let name = subPath[1] || new URL(request.url).searchParams.get("name");
    if (!name) return new Response(JSON.stringify({error: "请提供版本名称"}), {status: 400, headers: {"Content-Type": "application/json"}});
    let doResp = await stub.fetch("https://dummy-url/download?name=" + encodeURIComponent(name));
    if (!doResp.ok) return new Response(await doResp.text(), {status: doResp.status});
    let contentType = doResp.headers.get("Content-Type") || "application/zip";
    let contentDisposition = doResp.headers.get("Content-Disposition") || ('attachment; filename="' + name.replace(/"/g, '') + '.zip"');
    let blob = await doResp.blob();
    return new Response(blob, {headers: {"Content-Type": contentType, "Content-Disposition": contentDisposition}});
  }

  if (subPath[0] === "delete") {
    // 删除需要管理员密钥
    let key = request.headers.get("X-Admin-Key") || new URL(request.url).searchParams.get("key") || "";
    let permission = null;
    if (key === (env.ADMIN_SECRET_KEY || "del")) permission = "super";
    if (!permission && key === (env.ADMIN_KEY || "mod")) permission = "admin";
    if (!permission) {
      return new Response(JSON.stringify({error: "需要管理密钥"}), {status: 403, headers: {"Content-Type": "application/json"}});
    }
    let name = new URL(request.url).searchParams.get("name");
    if (!name) return new Response(JSON.stringify({error: "请提供版本名称"}), {status: 400, headers: {"Content-Type": "application/json"}});
    let doResp = await stub.fetch("https://dummy-url/delete?name=" + encodeURIComponent(name));
    return new Response(await doResp.text(), {status: doResp.status});
  }

  return new Response(JSON.stringify({error: "未找到操作"}), {status: 404, headers: {"Content-Type": "application/json"}});
}
