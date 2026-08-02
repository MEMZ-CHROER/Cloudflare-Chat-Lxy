// 管理后台标签操作

export async function handleAdminTags(path, request, env, url) {
  // M15：转发带 auth（admin.mjs 已注入 url.auth），registry 守卫校验
  let auth = encodeURIComponent(url.searchParams.get("auth") || "");
  switch (path[1]) {
    case "tag": {
      const action = path[2];
      const userName = url.searchParams.get("name");

      try {
        let registryId = env.registry.idFromName("global");
        let registryStub = env.registry.get(registryId);

        async function updateTagInRooms(name, tag, color, border) {
          try {
            let roomsResponse = await registryStub.fetch(new URL("https://dummy-url/list"));
            let rooms = await roomsResponse.json();
            for (let [roomName] of Object.entries(rooms)) {
              let id;
              if (roomName.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(roomName);
              else if (roomName.length <= 32) id = env.rooms.idFromName(roomName);
              else continue;
              let roomObject = env.rooms.get(id);
              await roomObject.fetch(new URL("https://dummy-url/tag-update?name=" + encodeURIComponent(name) + "&tag=" + encodeURIComponent(tag) + "&color=" + encodeURIComponent(color) + "&border=" + encodeURIComponent(border || "")));
            }
          } catch (e) {}
        }

        if (action === "set") {
          const tag = url.searchParams.get("tag");
          const color = url.searchParams.get("color") || "";
          const border = url.searchParams.get("border") || "";
          if (!userName) return new Response("请提供用户名", { status: 400 });
          if (!tag) return new Response("请提供标签", { status: 400 });
          let response = await registryStub.fetch(new URL("https://dummy-url/tag/set?name=" + encodeURIComponent(userName) + "&tag=" + encodeURIComponent(tag) + "&color=" + encodeURIComponent(color) + "&border=" + encodeURIComponent(border) + "&auth=" + auth));
          let text = await response.text();
          await updateTagInRooms(userName, tag, color, border);
          if (color === "gray") {
            try {
              let roomsResponse = await registryStub.fetch(new URL("https://dummy-url/list"));
              let rooms = await roomsResponse.json();
              for (let [roomName] of Object.entries(rooms)) {
                let id;
                if (roomName.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(roomName);
                else if (roomName.length <= 32) id = env.rooms.idFromName(roomName);
                else continue;
                let roomObject = env.rooms.get(id);
                await roomObject.fetch(new URL("https://dummy-url/do-kick?name=" + encodeURIComponent(userName)));
              }
            } catch (e) {}
          }
          return new Response(text, { status: response.status });
        } else if (action === "remove") {
          if (!userName) return new Response("请提供用户名", { status: 400 });
          let response = await registryStub.fetch(new URL("https://dummy-url/tag/remove?name=" + encodeURIComponent(userName) + "&auth=" + auth));
          let text = await response.text();
          await updateTagInRooms(userName, "", "", "");
          return new Response(text, { status: response.status });
        } else if (action === "list") {
          let response = await registryStub.fetch(new URL("https://dummy-url/tag/list"));
          let data = await response.json();
          return new Response(JSON.stringify(data), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        return new Response("未找到该操作", { status: 404 });
      } catch (error) {
        return new Response("标签操作失败: " + "操作失败", { status: 500 });
      }
    }

    case "user-tags": {
      try {
        let registryId = env.registry.idFromName("global");
        let stub = env.registry.get(registryId);
        let r = await stub.fetch(new URL("https://dummy-url/admin/user-inventory?auth=" + auth));
        let data = await r.json();
        return new Response(JSON.stringify(data), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      } catch (error) {
        return new Response(JSON.stringify({error: "操作失败"}), {status: 500});
      }
    }

    default:
      return null;
  }
}
