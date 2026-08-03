// 管理后台房间相关操作

export async function handleAdminRooms(path, request, env, url) {
  switch (path[1]) {
    case "clear-room": {
      const roomId = path[2];
      if (!roomId) return new Response("请提供要清空的房间名称或 ID。", { status: 400 });

      let id;
      if (roomId.match(/^[0-9a-f]{64}$/)) {
          id = env.rooms.idFromString(roomId);
      } else if (roomId.length <= 32) {
          id = env.rooms.idFromName(roomId);
      } else {
          return new Response("房间名称/ID格式不正确或过长。", { status: 400 });
      }

      try {
        let roomObject = env.rooms.get(id);
        const clearResponse = await roomObject.fetch(new URL("https://dummy-url/clear-messages"));

        if (clearResponse.ok) {
          return new Response(`房间 '${roomId}' 的聊天记录已清空。`, { status: 200 });
        } else {
          const errorText = await clearResponse.text();
          return new Response(`清空失败：${errorText}`, { status: clearResponse.status });
        }
      } catch (error) {
        console.error("清空聊天记录时发生错误:", error);
        return new Response(`清空聊天记录时发生内部错误: ${"操作失败"}`, { status: 500 });
      }
    }

    case "room-users": {
      const roomId = path[2];
      if (!roomId) return new Response("请提供房间名称或 ID。", { status: 400 });

      let id;
      if (roomId.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(roomId);
      else if (roomId.length <= 32) id = env.rooms.idFromName(roomId);
      else return new Response("房间名称/ID格式不正确或过长。", { status: 400 });

      try {
        let roomObject = env.rooms.get(id);
        let response = await roomObject.fetch(new URL("https://dummy-url/users"));
        let users = await response.json();
        return new Response(JSON.stringify(users), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      } catch (error) {
        return new Response("获取用户列表失败: " + "操作失败", { status: 500 });
      }
    }

    case "kick-user": {
      const roomId = path[2];
      const userName = url.searchParams.get("name");
      if (!roomId) return new Response("请提供房间名称或 ID。", { status: 400 });
      if (!userName) return new Response("请提供用户名（?name=xxx）。", { status: 400 });

      let id;
      if (roomId.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(roomId);
      else if (roomId.length <= 32) id = env.rooms.idFromName(roomId);
      else return new Response("房间名称/ID格式不正确或过长。", { status: 400 });

      try {
        let roomObject = env.rooms.get(id);
        let caller = url.searchParams.get("caller") || "";
        let doUrl = "https://dummy-url/do-kick?name=" + encodeURIComponent(userName) + "&caller=" + encodeURIComponent(caller);
        let response = await roomObject.fetch(new URL(doUrl));
        let text = await response.text();
        if (response.ok) return new Response(text, { status: 200 });
        return new Response(text, { status: response.status });
      } catch (error) {
        return new Response("踢人失败: " + "操作失败", { status: 500 });
      }
    }

    case "room-users-detail": {
      const roomId = path[2];
      if (!roomId) return new Response("请提供房间名称或 ID。", { status: 400 });

      let id;
      if (roomId.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(roomId);
      else if (roomId.length <= 32) id = env.rooms.idFromName(roomId);
      else return new Response("房间名称/ID格式不正确或过长。", { status: 400 });

      try {
        let roomObject = env.rooms.get(id);
        let response = await roomObject.fetch(new URL("https://dummy-url/users-detail"));
        let users = await response.json();
        return new Response(JSON.stringify(users), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      } catch (error) {
        return new Response("获取用户列表失败: " + "操作失败", { status: 500 });
      }
    }

    case "room-files": {
      const roomId = path[2];
      if (!roomId) return new Response("请提供房间名称或 ID。", { status: 400 });

      let id;
      if (roomId.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(roomId);
      else if (roomId.length <= 32) id = env.rooms.idFromName(roomId);
      else return new Response("房间名称/ID格式不正确或过长。", { status: 400 });

      try {
        let roomObject = env.rooms.get(id);
        let response = await roomObject.fetch(new URL("https://dummy-url/files"));
        let files = await response.json();
        return new Response(JSON.stringify(files), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      } catch (error) {
        return new Response("获取文件列表失败: " + "操作失败", { status: 500 });
      }
    }

    case "room-file-data": {
      const roomId = path[2];
      const ts = url.searchParams.get("timestamp");
      if (!roomId) return new Response("请提供房间名称或 ID。", { status: 400 });
      if (!ts) return new Response("请提供时间戳", { status: 400 });

      let id;
      if (roomId.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(roomId);
      else if (roomId.length <= 32) id = env.rooms.idFromName(roomId);
      else return new Response("房间名称/ID格式不正确或过长。", { status: 400 });

      try {
        let roomObject = env.rooms.get(id);
        let response = await roomObject.fetch(new URL("https://dummy-url/file-data?timestamp=" + encodeURIComponent(ts)));
        let data = await response.json();
        let fileName = data.fileName || "download";
        let fileType = data.fileType || "application/octet-stream";
        let dataUri = data.data || "";
        // 🔒 安全修复（A9）：FileBucket 化的大文件消息只含 fid，按 fid 回查 filebucket DO 拉取内容
        if (!dataUri && data.fid && env.filebucket) {
          try {
            let bucketId = env.filebucket.idFromName("primary");
            let bucket = env.filebucket.get(bucketId);
            // 🔒 安全修复（F2）：filebucket 为内部服务，下载必须携带内部密钥
            let bResp = await bucket.fetch("https://dummy-url/download?fid=" + encodeURIComponent(data.fid), {
              headers: {"X-Internal-Key": env.ADMIN_SECRET_KEY || ""}
            });
            if (bResp.ok) {
              let buf = await bResp.arrayBuffer();
              return new Response(buf, {
                status: 200,
                headers: {
                  // 🔒 安全修复（F5）：Content-Type 固定为 octet-stream，不使用客户端声明的 fileType
                  "Content-Type": "application/octet-stream",
                  "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(fileName)
                }
              });
            }
          } catch (e) {}
        }
        let base64Match = dataUri.match(/^data:[^;]+;base64,(.+)$/);
        if (base64Match) {
          let raw = Uint8Array.from(atob(base64Match[1]), c => c.charCodeAt(0));
          return new Response(raw, {
            status: 200,
            headers: {
              // 🔒 安全修复（F5）：Content-Type 固定为 octet-stream，不使用客户端声明的 fileType
              "Content-Type": "application/octet-stream",
              "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(fileName)
            }
          });
        }
        return new Response("文件数据无效", { status: 400 });
      } catch (error) {
        return new Response("获取文件数据失败: " + "操作失败", { status: 500 });
      }
    }

    case "room-messages": {
      const roomId = path[2];
      const limit = parseInt(url.searchParams.get("limit")) || 30;
      if (!roomId) return new Response("请提供房间名称或 ID。", { status: 400 });

      let id;
      if (roomId.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(roomId);
      else if (roomId.length <= 32) id = env.rooms.idFromName(roomId);
      else return new Response("房间名称/ID格式不正确或过长。", { status: 400 });

      try {
        let roomObject = env.rooms.get(id);
        let response = await roomObject.fetch(new URL("https://dummy-url/messages?limit=" + limit));
        let data = await response.json();
        return new Response(JSON.stringify(data), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      } catch (error) {
        return new Response("获取消息失败: " + "操作失败", { status: 500 });
      }
    }

    case "room-password": {
      const roomId = path[2];
      const password = url.searchParams.get("password") || "";
      if (!roomId) return new Response("请提供房间名称或 ID。", { status: 400 });
      try {
        let registryId = env.registry.idFromName("global");
        let stub = env.registry.get(registryId);
        // M15：/set-password 属 registry 管理端点，转发带 auth
        let auth = encodeURIComponent(url.searchParams.get("auth") || "");
        let r = await stub.fetch("https://dummy-url/set-password?name=" + encodeURIComponent(roomId) + "&password=" + encodeURIComponent(password) + "&auth=" + auth);
        return new Response(await r.text(), { status: r.status });
      } catch (error) {
        return new Response("操作失败: " + "操作失败", { status: 500 });
      }
    }

    case "destroy-room": {
      const roomId = path[2];
      if (!roomId) return new Response("请提供房间名称或 ID。", { status: 400 });
      // 危险操作：销毁房间不可撤销，前端需二次确认
      let id;
      if (roomId.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(roomId);
      else if (roomId.length <= 32) id = env.rooms.idFromName(roomId);
      else return new Response("房间名称/ID格式不正确或过长。", { status: 400 });
      try {
        let roomObject = env.rooms.get(id);
        let destroyUrl = new URL("https://dummy-url/do-destroy");
        destroyUrl.searchParams.set("room_name", roomId);
        await roomObject.fetch(destroyUrl);
        // 二次确认：直接从 registry 删除房间记录（防止 DO 关闭连接后 updateRegistry 重建）
        try {
          let registryId = env.registry.idFromName("global");
          let stub = env.registry.get(registryId);
          await stub.fetch(new URL("https://dummy-url/room-destroy?name=" + encodeURIComponent(roomId)));
        } catch (e) {}
        return new Response("房间 " + roomId + " 已销毁", { status: 200 });
      } catch (error) {
        // 🔒 L1 脱敏：不向客户端回传内部错误详情
        return new Response("销毁房间失败: 服务器内部错误", { status: 500 });
      }
    }

    default:
      return null;
  }
}
