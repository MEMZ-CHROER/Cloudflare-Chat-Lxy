// 房间 API - 创建、加入、列表

// 🔒 安全修复（W1/A2）：密码房间的数据端点必须携带正确密码，否则拒绝
async function requireRoomPassword(env, name, request) {
  try {
    let registryId = env.registry.idFromName("global");
    let stub = env.registry.get(registryId);
    let pResp = await stub.fetch("https://dummy-url/password-status?name=" + encodeURIComponent(name));
    let pData = await pResp.json();
    if (!pData.hasPassword) return true;
    let pwd = new URL(request.url).searchParams.get("password") || "";
    let vResp = await stub.fetch("https://dummy-url/verify-password", {
      method: "POST", body: JSON.stringify({name, password: pwd}), headers: {"Content-Type": "application/json"}
    });
    let vData = await vResp.json();
    return !!vData.ok;
  } catch (e) {
    // 🔒 安全修复（LD3）：校验出错一律拒绝（fail-closed），宁可误伤也不让密码房在故障窗口裸奔
    return false;
  }
}

export async function handleRooms(path, request, env) {
  switch (path[0]) {
    case "rooms": {
      if (path[1] === "list") {
        try {
          let registryId = env.registry.idFromName("global");
          let registryStub = env.registry.get(registryId);
          let response = await registryStub.fetch(new URL("https://dummy-url/list"));
          let data = await response.json();
          // 🔒 安全修复（LD4）：移除通配 CORS，房间清单仅允许同源访问
          return new Response(JSON.stringify(data), {
            headers: {"Content-Type": "application/json"}
          });
        } catch (error) {
          return new Response(JSON.stringify({error: error.message}), {status: 500});
        }
      }
      return new Response("未找到", {status: 404});
    }

    case "room": {
      if (!path[1]) {
        if (request.method == "POST") {
          let id = env.rooms.newUniqueId();
          return new Response(id.toString());
        } else {
          return new Response("方法不允许", {status: 405});
        }
      }

      let name = path[1];
      // 🔒 房间名白名单：只允许字母数字下划线连字符，或64位hex的DO ID，防止恶意房间名被存储触发XSS
      let isValidName = (name.length <= 32 && /^[a-zA-Z0-9_\-]+$/.test(name)) || /^[0-9a-f]{64}$/.test(name);
      if (!isValidName) {
        return new Response("房间名称包含非法字符", {status: 400});
      }
      let id;
      if (name.match(/^[0-9a-f]{64}$/)) {
        id = env.rooms.idFromString(name);
      } else {
        id = env.rooms.idFromName(name);
      }

      let roomObject = env.rooms.get(id);

    // Password check/verify endpoints (handled via registry, not chatroom DO)
    if (path[2] === "password-status") {
      try {
        let registryId = env.registry.idFromName("global");
        let registryStub = env.registry.get(registryId);
        let r = await registryStub.fetch("https://dummy-url/password-status?name=" + encodeURIComponent(name));
        return new Response(await r.text(), {headers: {"Content-Type": "application/json"}});
      } catch (error) {
        return new Response(JSON.stringify({hasPassword: false}), {headers: {"Content-Type": "application/json"}});
      }
    }
    if (path[2] === "verify-password") {
      try {
        let registryId = env.registry.idFromName("global");
        let registryStub = env.registry.get(registryId);
        let body = await request.json();
        body.name = name;
        let r = await registryStub.fetch("https://dummy-url/verify-password", {method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}});
        return new Response(await r.text(), {status: r.status, headers: {"Content-Type": "application/json"}});
      } catch (error) {
        return new Response(JSON.stringify({ok: false, error: error.message}), {status: 500});
      }
    }

      // 加载更多历史消息（无限滚动）
      if (path[2] === "history") {
        // 🔒 安全修复（W1/A2）：密码房间历史需校验密码
        if (!(await requireRoomPassword(env, name, request))) {
          return new Response(JSON.stringify({error: "房间需要密码才能访问"}), {status: 401, headers: {"Content-Type": "application/json"}});
        }
        let hLimit = new URL(request.url).searchParams.get("limit") || 50;
        let hBefore = new URL(request.url).searchParams.get("before") || "";
        let hUrl = "https://dummy-url/messages?limit=" + hLimit;
        if (hBefore) hUrl += "&before=" + encodeURIComponent(hBefore);
        let hResp = await roomObject.fetch(new URL(hUrl));
        let hData = await hResp.json();
        let filtered = (Array.isArray(hData) ? hData : []).filter(m => m.type !== "file");
        return new Response(JSON.stringify(filtered), {
          headers: {"Content-Type": "application/json"}
        });
      }

      // 🔒 S1 安全修复：只放行公开只读端点。
      // 其余（do-kick/do-destroy/broadcast-message/users-detail/tag-update/message/recall 等）
      // 必须通过带管理密钥认证的 /api/admin/* 执行，杜绝任何匿名访客直达房间 DO。
      const PUBLIC_ROOM_ENDPOINTS = [
        "websocket",        // 聊天连接
        "messages",         // 历史消息（只读）
        "users",            // 在线用户列表（不含 IP）
        "files",            // 文件列表（只读）
        "file-data",        // 文件内容（只读）
        "get-announcement", // 公告（只读）
        "get-pinned",       // 置顶消息（只读）
        "export"            // 导出聊天记录（前端公开按钮）
      ];
      let roomSubPath = path[2];
      if (!PUBLIC_ROOM_ENDPOINTS.includes(roomSubPath)) {
        return new Response("无权限访问此操作。管理操作请通过 /api/admin/* 执行。", { status: 403 });
      }
      // 🔒 安全修复（W1/A2）：密码房间的数据端点（messages/files/file-data/users/export/get-announcement/get-pinned）必须带正确密码
      // websocket 端点已在握手时自行校验密码，此处跳过
      if (roomSubPath !== "websocket") {
        if (!(await requireRoomPassword(env, name, request))) {
          return new Response(JSON.stringify({error: "房间需要密码才能访问"}), {status: 401, headers: {"Content-Type": "application/json"}});
        }
      }

      let newUrl = new URL(request.url);
      newUrl.pathname = "/" + path.slice(2).join("/");
      newUrl.searchParams.set("room_name", name);

      return roomObject.fetch(newUrl, request);
    }
  }
  return new Response("未找到", {status: 404});
}
