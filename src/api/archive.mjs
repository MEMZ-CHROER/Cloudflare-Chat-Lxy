// 版本存档 API — /api/archive/*
/** 解析管理权限：返回 "super"/"admin"/null（无 key 返回 "no-key"） */
async function resolveArchivePermission(request, env) {
  let key = request.headers.get("X-Admin-Key") || new URL(request.url).searchParams.get("key") || "";
  if (!key) return "no-key";
  if (key === env.ADMIN_SECRET_KEY) return "super";
  if (key === env.ADMIN_KEY) return "admin";
  try {
    let registryId = env.registry.idFromName("global");
    let registryStub = env.registry.get(registryId);
    let authResp = await registryStub.fetch("https://dummy-url/combined-auth?key=" + encodeURIComponent(key));
    let auth = await authResp.json();
    if (auth.level) return auth.level;
  } catch (_) {}
  return null;
}

export async function handleArchive(apiPath, request, env) {
  // apiPath = ["archive", "upload"] or ["archive", "list"], etc.
  if (!env.archive) {
    return new Response(JSON.stringify({error: "版本存档系统未启用"}), {status: 503, headers: {"Content-Type": "application/json"}});
  }

  let id = env.archive.idFromName("archive");
  let stub = env.archive.get(id);

  // 去掉开头的 "archive"
  let subPath = apiPath.slice(1); // ["upload"], ["list"], ["download"], ["delete"], ["file"], ["file-list"], ["file-delete"]

  // 📦 单文件资源：POST 上传（super 鉴权），GET 拉取（公开，浏览器按需加载）
  if (subPath[0] === "file") {
    let path = new URL(request.url).searchParams.get("path") || "";
    if (!path) return new Response(JSON.stringify({error: "请提供文件路径"}), {status: 400, headers: {"Content-Type": "application/json"}});

    if (request.method === "POST") {
      let permission = await resolveArchivePermission(request, env);
      if (permission === "no-key") return new Response(JSON.stringify({error: "需要管理密钥"}), {status: 401, headers: {"Content-Type": "application/json"}});
      if (permission !== "super") return new Response(JSON.stringify({error: "仅超管可上传文件"}), {status: 403, headers: {"Content-Type": "application/json"}});

      let bodyBuf = await request.arrayBuffer();
      if (bodyBuf.byteLength > 50 * 1024 * 1024) {
        return new Response(JSON.stringify({error: "文件过大（最大50MB）"}), {status: 413, headers: {"Content-Type": "application/json"}});
      }
      let doResp = await stub.fetch("https://dummy-url/file-put?path=" + encodeURIComponent(path), {
        method: "POST", body: bodyBuf, headers: {"Content-Type": "application/octet-stream"}
      });
      return new Response(await doResp.text(), {status: doResp.status, headers: {"Content-Type": "application/json"}});
    }

    // GET：公开拉取
    let doResp = await stub.fetch("https://dummy-url/file-get?path=" + encodeURIComponent(path));
    if (!doResp.ok) return new Response(await doResp.text(), {status: doResp.status});
    let contentType = doResp.headers.get("Content-Type") || "application/octet-stream";
    let cacheControl = doResp.headers.get("Cache-Control") || "public, max-age=3600";
    let blob = await doResp.blob();
    return new Response(blob, {
      headers: {"Content-Type": contentType, "Cache-Control": cacheControl, "Access-Control-Allow-Origin": "*"}
    });
  }

  // 📦 文件列表 / 删除（仅超管）
  if (subPath[0] === "file-list" || subPath[0] === "file-delete") {
    let permission = await resolveArchivePermission(request, env);
    if (permission === "no-key") return new Response(JSON.stringify({error: "需要管理密钥"}), {status: 401, headers: {"Content-Type": "application/json"}});
    if (permission !== "super") return new Response(JSON.stringify({error: "仅超管可管理文件"}), {status: 403, headers: {"Content-Type": "application/json"}});
    let doResp = await stub.fetch("https://dummy-url/" + subPath[0] + "?path=" + encodeURIComponent(new URL(request.url).searchParams.get("path") || ""));
    return new Response(await doResp.text(), {status: doResp.status, headers: {"Content-Type": "application/json"}});
  }

  if (subPath[0] === "upload") {
    // 需要管理员验证 — 走 admin.mjs 相同的逻辑
    let permission = await resolveArchivePermission(request, env);
    if (permission === "no-key") return new Response(JSON.stringify({error: "需要管理密钥"}), {status: 401, headers: {"Content-Type": "application/json"}});
    if (!permission) {
      return new Response(JSON.stringify({error: "密钥无效"}), {status: 403, headers: {"Content-Type": "application/json"}});
    }
    // 🔒 M4 修复：上传版本存档仅限超管密钥（ADMIN_SECRET_KEY）。普通 admin（ADMIN_KEY）无权上传，
    // 防普通管理员误传含敏感文件的 zip（存档包为公开下载，泄露风险来自"误传含密钥文件"，故收严到 super）
    if (permission !== "super") {
      return new Response(JSON.stringify({error: "仅超管可上传存档"}), {status: 403, headers: {"Content-Type": "application/json"}});
    }

    let name = new URL(request.url).searchParams.get("name");
    let description = new URL(request.url).searchParams.get("description") || "";
    if (!name) return new Response(JSON.stringify({error: "请提供版本名称"}), {status: 400, headers: {"Content-Type": "application/json"}});

    // 🔒 M4 修复：体积限制改为读取实际 body 字节数校验（不再依赖可被 Transfer-Encoding: chunked 绕过的 Content-Length 头）。
    // request.arrayBuffer() 由运行时聚合完整请求体（含 chunked），byteLength 即真实大小。
    // 🔒 安全修复（F7）：先做 Content-Length 预检——头声明 >50MB 直接 413，避免把超大请求体读入内存（DoS 缓解）。
    // Content-Length 可缺失/伪造，故仍以下方实际 byteLength 校验为最终依据，两层防护。
    let contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
    if (contentLength > 50 * 1024 * 1024) {
      return new Response(JSON.stringify({error: "存档文件过大（最大50MB）"}), {status: 413, headers: {"Content-Type": "application/json"}});
    }
    let bodyBuf = await request.arrayBuffer();
    if (bodyBuf.byteLength > 50 * 1024 * 1024) {
      return new Response(JSON.stringify({error: "存档文件过大（最大50MB）"}), {status: 413, headers: {"Content-Type": "application/json"}});
    }

    // 转发整个 body（已缓冲的 ArrayBuffer）到 DO
    let doResp = await stub.fetch("https://dummy-url/upload?name=" + encodeURIComponent(name) + "&description=" + encodeURIComponent(description), {
      method: "POST",
      body: bodyBuf,
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
    // 🔒 安全修复（A6）：删除存档仅限超管密钥（普通管理员无权删除，防恶意删历史存档）
    let key = request.headers.get("X-Admin-Key") || new URL(request.url).searchParams.get("key") || "";
    if (!key || key !== (env.ADMIN_SECRET_KEY || "")) {
      return new Response(JSON.stringify({error: "仅超管可删除存档"}), {status: 403, headers: {"Content-Type": "application/json"}});
    }
    let name = new URL(request.url).searchParams.get("name");
    if (!name) return new Response(JSON.stringify({error: "请提供版本名称"}), {status: 400, headers: {"Content-Type": "application/json"}});
    let doResp = await stub.fetch("https://dummy-url/delete?name=" + encodeURIComponent(name));
    return new Response(await doResp.text(), {status: doResp.status});
  }

  return new Response(JSON.stringify({error: "未找到操作"}), {status: 404, headers: {"Content-Type": "application/json"}});
}
