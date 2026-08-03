// 管理后台消息相关操作（公告、黑名单、撤回、发送消息）

export async function handleAdminMessages(path, request, env, url) {
  // path 结构：["admin", "announcement", "room"] 或 ["admin", "message", "recall", "room"]
  // announcement/blacklist/send-message: path[1]=操作, path[2]=房间
  // message/recall: path[1]="message", path[2]="recall", path[3]=房间
  const isMsgPrefix = path[1] === "message";
  const action = isMsgPrefix ? path[2] : path[1];
  const roomIdx = isMsgPrefix ? 3 : 2;
  switch (action) {
    case "announcement": {
      const annRoom = path[roomIdx];
      const annText = url.searchParams.get("text") || "";
      if (!annRoom) return new Response("请提供房间名", {status: 400});
      let id;
      if (annRoom.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(annRoom);
      else if (annRoom.length <= 32) id = env.rooms.idFromName(annRoom);
      else return new Response("无效房间", {status: 400});
      let roomObj = env.rooms.get(id);
      let doUrl = new URL("https://dummy-url/set-announcement?text=" + encodeURIComponent(annText));
      let resp = await roomObj.fetch(doUrl);
      return new Response(await resp.text(), {status: resp.status});
    }

    case "blacklist": {
      const blAction = path[roomIdx];
      const roomId = path[roomIdx + 1];
      if (!roomId) return new Response("请提供房间名称或 ID。", { status: 400 });

      let id;
      if (roomId.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(roomId);
      else if (roomId.length <= 32) id = env.rooms.idFromName(roomId);
      else return new Response("房间名称/ID格式不正确或过长。", { status: 400 });

      try {
        let roomObject = env.rooms.get(id);
        let doUrl = "https://dummy-url/blacklist/" + blAction;
        // 🔒 安全修复（A8）：黑名单 add/remove 判断变量写错（action 恒为 "blacklist"），导致 ?name= 从不拼接、功能失效
        if (blAction === "add" || blAction === "remove") {
          const userName = url.searchParams.get("name");
          if (!userName) return new Response("请提供用户名（?name=xxx）。", { status: 400 });
          doUrl += "?name=" + encodeURIComponent(userName);
        }
        const response = await roomObject.fetch(new URL(doUrl));
        const text = await response.text();
        if (response.ok) return new Response(text, { status: 200 });
        return new Response(text, { status: response.status });
      } catch (error) {
        return new Response("操作黑名单时发生错误: " + "操作失败", { status: 500 });
      }
    }

    case "level-style": {
      // 🏅 房间等级样式：/api/admin/level-style/<set|clear>/<room>?level=&color=&icon=&text=
      const lsAction = path[roomIdx];
      const lsRoom = path[roomIdx + 1];
      if (!lsRoom) return new Response("请提供房间名", {status: 400});
      let id;
      if (lsRoom.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(lsRoom);
      else if (lsRoom.length <= 32) id = env.rooms.idFromName(lsRoom);
      else return new Response("无效房间", {status: 400});
      let roomObj = env.rooms.get(id);
      let lsLevel = url.searchParams.get("level");
      if (!lsLevel) return new Response("请提供等级（1-999）", {status: 400});
      let doUrl;
      if (lsAction === "set") {
        let color = url.searchParams.get("color") || "";
        let icon = url.searchParams.get("icon") || "";
        let text = url.searchParams.get("text") || "";
        // 防护：图标 ≤4 字、文字 ≤10 字、拒 HTML；颜色白名单由 DO 层 SAFE_COLOR_RE 统一校验（非法置空）
        if (icon.length > 4 || /[<>&"']/.test(icon)) return new Response("图标不合法（≤4字符且不含HTML特殊字符）", {status: 400});
        if (text.length > 10 || /[<>&"']/.test(text)) return new Response("文字不合法（≤10字符且不含HTML特殊字符）", {status: 400});
        doUrl = new URL("https://dummy-url/set-level-styles?level=" + encodeURIComponent(lsLevel) + "&color=" + encodeURIComponent(color) + "&icon=" + encodeURIComponent(icon) + "&text=" + encodeURIComponent(text));
      } else if (lsAction === "clear") {
        doUrl = new URL("https://dummy-url/clear-level-style?level=" + encodeURIComponent(lsLevel));
      } else {
        return new Response("未找到该操作", {status: 404});
      }
      try {
        let resp = await roomObj.fetch(doUrl);
        return new Response(await resp.text(), {status: resp.status});
      } catch (error) {
        return new Response("等级样式操作失败: " + "操作失败", {status: 500});
      }
    }

    case "recall": {
      const recallRoom = path[roomIdx];
      const recallTs = url.searchParams.get("timestamp");
      const recallName = url.searchParams.get("name");
      if (!recallRoom || !recallTs || !recallName) return new Response("缺少参数", {status: 400});

      let recallId;
      if (recallRoom.match(/^[0-9a-f]{64}$/)) recallId = env.rooms.idFromString(recallRoom);
      else if (recallRoom.length <= 32) recallId = env.rooms.idFromName(recallRoom);
      else return new Response("房间名称/ID格式不正确。", { status: 400 });

      try {
        let roomObj = env.rooms.get(recallId);
        let resp = await roomObj.fetch(new URL("https://dummy-url/message/recall?timestamp=" + encodeURIComponent(recallTs) + "&name=" + encodeURIComponent(recallName)));
        let text = await resp.text();
        return new Response(text, {status: resp.status});
      } catch (error) {
        return new Response("撤回失败: " + "操作失败", { status: 500 });
      }
    }

    case "send-message": {
      const msgRoom = path[roomIdx];
      const msgText = url.searchParams.get("text");
      const msgSender = url.searchParams.get("sender") || "系统公告";
      if (!msgRoom) return new Response("请提供房间名", {status: 400});
      if (!msgText) return new Response("请提供消息内容", {status: 400});

      let msgId;
      if (msgRoom.match(/^[0-9a-f]{64}$/)) msgId = env.rooms.idFromString(msgRoom);
      else if (msgRoom.length <= 32) msgId = env.rooms.idFromName(msgRoom);
      else return new Response("房间名称/ID格式不正确", {status: 400});

      try {
        let roomObj = env.rooms.get(msgId);
        let resp = await roomObj.fetch(new URL("https://dummy-url/broadcast-message?text=" + encodeURIComponent(msgText) + "&sender=" + encodeURIComponent(msgSender)));
        let result = await resp.text();
        return new Response(result, {status: resp.status});
      } catch (error) {
        return new Response("发送消息失败: " + "操作失败", {status: 500});
      }
    }

    case "pin": {
      // 📌 置顶消息：/api/admin/pin/<set|clear|get>/<room>?channel=&timestamp=
      const pinAction = path[roomIdx];
      const pinRoom = path[roomIdx + 1];
      if (!pinRoom) return new Response("请提供房间名", {status: 400});
      let pinId;
      if (pinRoom.match(/^[0-9a-f]{64}$/)) pinId = env.rooms.idFromString(pinRoom);
      else if (pinRoom.length <= 32) pinId = env.rooms.idFromName(pinRoom);
      else return new Response("无效房间", {status: 400});
      let roomObj = env.rooms.get(pinId);
      let pinChannel = url.searchParams.get("channel") || "general";
      if (pinAction === "set") {
        let pinTs = url.searchParams.get("timestamp");
        if (!pinTs || !/^\d+$/.test(pinTs)) return new Response("请提供有效消息时间戳", {status: 400});
        let doUrl = new URL("https://dummy-url/set-pinned?channel=" + encodeURIComponent(pinChannel) + "&timestamp=" + encodeURIComponent(pinTs));
        try {
          let resp = await roomObj.fetch(doUrl);
          return new Response(await resp.text(), {status: resp.status});
        } catch (e) {
          return new Response("置顶失败: 操作失败", {status: 500});
        }
      } else if (pinAction === "clear") {
        let pinTs = url.searchParams.get("timestamp");
        if (!pinTs || !/^\d+$/.test(pinTs)) return new Response("请提供有效消息时间戳", {status: 400});
        let doUrl = new URL("https://dummy-url/clear-pinned?channel=" + encodeURIComponent(pinChannel) + "&timestamp=" + encodeURIComponent(pinTs));
        try {
          let resp = await roomObj.fetch(doUrl);
          return new Response(await resp.text(), {status: resp.status});
        } catch (e) {
          return new Response("取消置顶失败: 操作失败", {status: 500});
        }
      } else if (pinAction === "get") {
        try {
          let resp = await roomObj.fetch(new URL("https://dummy-url/get-pinned"));
          let text = await resp.text();
          return new Response(text, {status: resp.status, headers: {"Content-Type": "application/json"}});
        } catch (e) {
          return new Response("读取置顶失败: 操作失败", {status: 500});
        }
      } else {
        return new Response("未找到该操作", {status: 404});
      }
    }

    default:
      return null;
  }
}
