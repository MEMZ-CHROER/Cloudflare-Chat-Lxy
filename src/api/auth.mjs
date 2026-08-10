// 认证 API - 注册、登录、检查登录状态

export async function handleAuth(path, request, env) {
  const url = new URL(request.url);

  switch (path[0]) {
    case "register": {
      if (request.method !== "POST") return new Response("方法不允许", {status: 405});
      try {
        let body = await request.json();
        // 🔒 安全修复（E4）：携带来源 IP 供注册限频，防批量注册小号
        body.ip = request.headers.get("CF-Connecting-IP") || "";
        let registryId = env.registry.idFromName("global");
        let stub = env.registry.get(registryId);
        let r = await stub.fetch("https://dummy-url/user-register", {method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}});
        return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
      } catch (e) {
        // 🔒 L1 脱敏：不向客户端回传内部错误详情
        return new Response(JSON.stringify({error: "服务器内部错误"}), {status: 500});
      }
    }

    case "check-auth": {
      let caName = url.searchParams.get("name");
      let caToken = url.searchParams.get("token") || "";
      if (!caName) return new Response(JSON.stringify({authenticated: false}), {headers: {"Content-Type": "application/json"}});
      try {
        let registryId = env.registry.idFromName("global");
        let stub = env.registry.get(registryId);
        let r = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(caName) + "&token=" + encodeURIComponent(caToken)));
        return new Response(await r.text(), {status: 200, headers: {"Content-Type": "application/json"}});
      } catch (e) {
        // 🔒 L1 脱敏：不向客户端回传内部错误详情
        return new Response(JSON.stringify({authenticated: false, error: "服务器内部错误"}), {headers: {"Content-Type": "application/json"}});
      }
    }

    case "login": {
      if (request.method !== "POST") return new Response("方法不允许", {status: 405});
      try {
        let body = await request.json();
        // 🗝️ v1.55 多设备会话：注入设备标识（UA 摘要）与来源 IP，供会话列表展示（前端可不传，自动收集）
        if (!body.device) body.device = (request.headers.get("user-agent") || "").replace(/\s+/g, " ").slice(0, 60);
        if (!body.ip) body.ip = request.headers.get("CF-Connecting-IP") || "";
        let registryId = env.registry.idFromName("global");
        let stub = env.registry.get(registryId);
        let r = await stub.fetch("https://dummy-url/user-login", {method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}});
        return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
      } catch (e) {
        // 🔒 L1 脱敏：不向客户端回传内部错误详情
        return new Response(JSON.stringify({error: "服务器内部错误"}), {status: 500});
      }
    }

    case "logout": {
      // 🔒 安全修复（LD8）：服务端登出，吊销 token
      if (request.method !== "POST") return new Response("方法不允许", {status: 405});
      try {
        let body = await request.json();
        let registryId = env.registry.idFromName("global");
        let stub = env.registry.get(registryId);
        let r = await stub.fetch("https://dummy-url/user-logout", {method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}});
        return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
      } catch (e) {
        // 🔒 L1 脱敏：不向客户端回传内部错误详情
        return new Response(JSON.stringify({error: "服务器内部错误"}), {status: 500});
      }
    }

    case "user-sessions": {
      // 🗝️ v1.55 多设备会话管理（list/revoke/revoke-all）：body 透传 registry /user-sessions
      if (request.method !== "POST") return new Response("方法不允许", {status: 405});
      try {
        let body = await request.json();
        let registryId = env.registry.idFromName("global");
        let stub = env.registry.get(registryId);
        let r = await stub.fetch("https://dummy-url/user-sessions", {method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}});
        return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
      } catch (e) {
        // 🔒 L1 脱敏：不向客户端回传内部错误详情
        return new Response(JSON.stringify({error: "服务器内部错误"}), {status: 500});
      }
    }
  }
  return new Response("未找到", {status: 404});
}
