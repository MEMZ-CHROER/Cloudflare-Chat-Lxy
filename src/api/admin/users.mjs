// 管理后台用户相关操作

export async function handleAdminUsers(path, request, env, url) {
  // M15：转发带 auth（admin.mjs 已注入 url.auth），registry 守卫校验
  let auth = encodeURIComponent(url.searchParams.get("auth") || "");
  switch (path[1]) {
    case "kick-protect": {
      const action = path[2];
      try {
        let registryId = env.registry.idFromName("global");
        let stub = env.registry.get(registryId);
        if (action === "list") {
          let r = await stub.fetch(new URL("https://dummy-url/kick-protected-list"));
          return new Response(await r.text(), { status: 200, headers: {"Content-Type": "application/json"} });
        }
        const userName = url.searchParams.get("name");
        if (!userName) return new Response("请提供用户名", { status: 400 });
        if (action === "add") {
          let r = await stub.fetch(new URL("https://dummy-url/kick-protect?name=" + encodeURIComponent(userName) + "&auth=" + auth));
          return new Response(await r.text(), { status: r.status });
        }
        if (action === "remove") {
          let r = await stub.fetch(new URL("https://dummy-url/kick-unprotect?name=" + encodeURIComponent(userName) + "&auth=" + auth));
          return new Response(await r.text(), { status: r.status });
        }
      } catch (error) {
        return new Response("操作失败: " + "操作失败", { status: 500 });
      }
      return new Response("未找到", { status: 404 });
    }
    case "all-users": {
      try {
        let registryId = env.registry.idFromName("global");
        let registryStub = env.registry.get(registryId);
        let roomsResponse = await registryStub.fetch(new URL("https://dummy-url/list"));
        let rooms = await roomsResponse.json();

        let result = {};
        for (let [name] of Object.entries(rooms)) {
          let id;
          if (name.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(name);
          else if (name.length <= 32) id = env.rooms.idFromName(name);
          else continue;

          let roomObject = env.rooms.get(id);
          let usersResponse = await roomObject.fetch(new URL("https://dummy-url/users"));
          let users = await usersResponse.json();
          if (users.length > 0) result[name] = users;
        }

        return new Response(JSON.stringify(result), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      } catch (error) {
        return new Response("获取用户列表失败: " + "操作失败", { status: 500 });
      }
    }

    case "global-kick": {
      const userName = url.searchParams.get("name");
      if (!userName) return new Response("请提供用户名", { status: 400 });

      try {
        let registryId = env.registry.idFromName("global");
        let registryStub = env.registry.get(registryId);
        let roomsResponse = await registryStub.fetch(new URL("https://dummy-url/list"));
        let rooms = await roomsResponse.json();

        let kickedFrom = [];
        for (let [name] of Object.entries(rooms)) {
          let id;
          if (name.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(name);
          else if (name.length <= 32) id = env.rooms.idFromName(name);
          else continue;

          let roomObject = env.rooms.get(id);
          let doUrl = "https://dummy-url/do-kick?name=" + encodeURIComponent(userName);
          let response = await roomObject.fetch(new URL(doUrl));
          if (response.ok) kickedFrom.push(name);
        }

        return new Response(JSON.stringify({kickedFrom}), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      } catch (error) {
        return new Response("全局踢出失败: " + "操作失败", { status: 500 });
      }
    }

    case "global-kick-all": {
      // v1.40 运维：把所有在线用户从所有聊天室踢出（仅 super），不销毁房间不清消息
      try {
        let registryId = env.registry.idFromName("global");
        let registryStub = env.registry.get(registryId);
        let roomsResponse = await registryStub.fetch(new URL("https://dummy-url/list"));
        let rooms = await roomsResponse.json();

        let cleared = [];
        for (let [name] of Object.entries(rooms)) {
          let id;
          if (name.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(name);
          else if (name.length <= 32) id = env.rooms.idFromName(name);
          else continue;

          let roomObject = env.rooms.get(id);
          let response = await roomObject.fetch(new URL("https://dummy-url/do-kick-all"));
          if (response.ok) cleared.push(name);
        }

        return new Response(JSON.stringify({clearedRooms: cleared, totalRooms: Object.keys(rooms).length}), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      } catch (error) {
        return new Response("全局清场失败: " + "操作失败", { status: 500 });
      }
    }

    case "users": {
      try {
        let registryId = env.registry.idFromName("global");
        let registryStub = env.registry.get(registryId);
        if (path[2] === "history") {
          let response = await registryStub.fetch(new URL("https://dummy-url/known-users"));
          let data = await response.json();
          return new Response(JSON.stringify(data), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }
        return new Response("未找到该操作", { status: 404 });
      } catch (error) {
        return new Response("获取用户列表失败: " + "操作失败", { status: 500 });
      }
    }

    case "user-ips": {
      try {
        let registryId = env.registry.idFromName("global");
        let registryStub = env.registry.get(registryId);
        let response = await registryStub.fetch(new URL("https://dummy-url/user-ips"));
        let data = await response.json();
        return new Response(JSON.stringify(data), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      } catch (error) {
        return new Response("获取用户IP失败: " + "操作失败", { status: 500 });
      }
    }

    case "ban": {
      const action = path[2];
      const userName = url.searchParams.get("name");

      try {
        let registryId = env.registry.idFromName("global");
        let registryStub = env.registry.get(registryId);

        if (action === "add") {
          if (!userName) return new Response("请提供用户名", { status: 400 });
          let response = await registryStub.fetch(new URL("https://dummy-url/ban?name=" + encodeURIComponent(userName) + "&auth=" + auth));
          let text = await response.text();
          try {
            let ipRes = await registryStub.fetch(new URL("https://dummy-url/user-ips"));
            let ips = await ipRes.json();
            let userIp = ips[userName];
            if (userIp) {
              await registryStub.fetch(new URL("https://dummy-url/ip-ban?ip=" + encodeURIComponent(userIp) + "&auth=" + auth));
              text += "（IP已同时封禁）";
            }
          } catch (e) {}
          return new Response(text, { status: response.status });
        } else if (action === "remove") {
          if (!userName) return new Response("请提供用户名", { status: 400 });
          let response = await registryStub.fetch(new URL("https://dummy-url/unban?name=" + encodeURIComponent(userName) + "&auth=" + auth));
          let text = await response.text();
          return new Response(text, { status: response.status });
        } else if (action === "list") {
          let response = await registryStub.fetch(new URL("https://dummy-url/banned-list"));
          let data = await response.json();
          return new Response(JSON.stringify(data), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        return new Response("未找到该操作", { status: 404 });
      } catch (error) {
        return new Response("封禁操作失败: " + "操作失败", { status: 500 });
      }
    }

    case "global-blacklist": {
      const gbAction = path[2];
      const gbName = url.searchParams.get("name");

      try {
        let registryId = env.registry.idFromName("global");
        let registryStub = env.registry.get(registryId);

        if (gbAction === "add") {
          if (!gbName) return new Response("请提供用户名", { status: 400 });
          let response = await registryStub.fetch(new URL("https://dummy-url/global-blacklist/add?name=" + encodeURIComponent(gbName) + "&auth=" + auth));
          return new Response(await response.text(), { status: response.status });
        } else if (gbAction === "remove") {
          if (!gbName) return new Response("请提供用户名", { status: 400 });
          let response = await registryStub.fetch(new URL("https://dummy-url/global-blacklist/remove?name=" + encodeURIComponent(gbName) + "&auth=" + auth));
          return new Response(await response.text(), { status: response.status });
        } else if (gbAction === "list") {
          let response = await registryStub.fetch(new URL("https://dummy-url/global-blacklist/list"));
          let data = await response.json();
          return new Response(JSON.stringify(data), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        return new Response("未找到该操作", { status: 404 });
      } catch (error) {
        return new Response("全局黑名单操作失败: " + "操作失败", { status: 500 });
      }
    }

    case "delete-user": {
      const userName = url.searchParams.get("name");
      if (!userName) return new Response("请提供用户名", { status: 400 });
      try {
        let registryId = env.registry.idFromName("global");
        let registryStub = env.registry.get(registryId);
        let r = await registryStub.fetch(new URL("https://dummy-url/user-delete?name=" + encodeURIComponent(userName) + "&auth=" + auth));
        return new Response(await r.text(), { status: r.status });
      } catch (error) {
        // 🔒 L1 脱敏：不向客户端回传内部错误详情
        return new Response("删除用户失败: 服务器内部错误", { status: 500 });
      }
    }

    default:
      return null;
  }
}
