import { handleErrors } from "./utils.mjs";
import { handleMedia } from "./chatroom/media.mjs";
import { handleManage } from "./chatroom/manage.mjs";

// ChatRoom Durable Object — 管理单个聊天室的状态和 WebSocket 连接
export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
    this.env = env;
    this.sessions = new Map();

    this.state.getWebSockets().forEach((webSocket) => {
      let meta = webSocket.deserializeAttachment();
      let blockedMessages = [];
      this.sessions.set(webSocket, { ...meta, blockedMessages });
    });

    this.lastTimestamp = 0;
    this.connCounter = 0;
    this.msgCounter = 0;
    this.messages = new Map();

    this.blacklist = new Set();
    this._loadBlacklist = this.storage.get("blacklist").then(list => {
      if (list) this.blacklist = new Set(list);
    });

    this.announcement = "";
    this._loadAnnouncement = this.storage.get("announcement").then(text => {
      if (text) this.announcement = text;
    });

    this.destroyed = false;
    this.pinnedMessage = null;
    this._loadPinned = this.storage.get("pinnedMessage").then(data => {
      if (data) {
        try { this.pinnedMessage = JSON.parse(data); } catch (e) { this.pinnedMessage = null; }
      }
    });

    this.scheduledMessages = [];
    this._loadScheduled = this.storage.get("scheduledMessages").then(list => {
      this.scheduledMessages = list || [];
      if (this.scheduledMessages.length > 0) {
        let nextTime = Math.min(...this.scheduledMessages.map(s => s.time));
        this.state.storage.setAlarm(nextTime).catch(() => {});
      }
    });

    this.polls = new Map();
    this._loadPolls = this.storage.get("polls").then(data => {
      if (data) this.polls = new Map(data);
    });

    this.relays = new Map();
    this._loadRelays = this.storage.get("relays").then(data => {
      if (data) this.relays = new Map(data);
    });

    this.highlights = [];
    this._loadHighlights = this.storage.get("highlights").then(data => {
      if (data) this.highlights = JSON.parse(data);
    });

    this.reactions = {};
    this._loadReactions = this.storage.get("reactions").then(data => {
      if (data) this.reactions = JSON.parse(data);
    });

    this.lotteryPools = new Map();
    this._loadLotteryPools = this.storage.get("lotteryPools").then(data => {
      if (data) {
        this.lotteryPools = new Map(data.map(([id, pool]) => {
          pool.prizes = new Map(pool.prizes);
          return [id, pool];
        }));
      }
    });
  }

  async fetch(request) {
    return await handleErrors(request, async () => {
      if (this._loadBlacklist) await this._loadBlacklist;

      let url = new URL(request.url);

      if (!this.roomName) {
        this.roomName = url.searchParams.get("room_name");
      }

      switch (url.pathname) {
        case "/websocket": {
          if (request.headers.get("Upgrade") != "websocket") {
            return new Response("需要 WebSocket", {status: 400});
          }
          let ip = request.headers.get("CF-Connecting-IP");
          // 检查房间密码
          if (this.roomName && this.env.registry) {
            try {
              let pwd = url.searchParams.get("password") || "";
              let registryId = this.env.registry.idFromName("global");
              let stub = this.env.registry.get(registryId);
              let pwdCheck = await stub.fetch("https://dummy-url/verify-password", {
                method: "POST",
                body: JSON.stringify({name: this.roomName, password: pwd}),
                headers: {"Content-Type": "application/json"}
              });
              let pwdResult = await pwdCheck.json();
              if (!pwdResult.ok) {
                return new Response("需要密码", {status: 403});
              }
            } catch (e) {
              return new Response("验证服务暂时不可用", {status: 503});
            }
          }
          let pair = new WebSocketPair();
          await this.handleSession(pair[1], ip);
          return new Response(null, { status: 101, webSocket: pair[0] });
        }
        case "/clear-messages": {
          await this.clearAllMessages();
          return new Response("聊天记录已清空。", { status: 200 });
        }

        case "/blacklist/add": {
          let name = url.searchParams.get("name");
          if (!name) return new Response("请提供用户名", { status: 400 });
          this.blacklist.add(name);
          await this.storage.put("blacklist", [...this.blacklist]);
          return new Response(name + " 已被加入黑名单", { status: 200 });
        }

        case "/blacklist/remove": {
          let name = url.searchParams.get("name");
          if (!name) return new Response("请提供用户名", { status: 400 });
          this.blacklist.delete(name);
          await this.storage.put("blacklist", [...this.blacklist]);
          return new Response(name + " 已被移出黑名单", { status: 200 });
        }

        case "/blacklist/list": {
          return new Response(JSON.stringify([...this.blacklist]), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        case "/users": {
          let users = [];
          for (let s of this.sessions.values()) {
            if (s.name) users.push(s.name);
            else users.push("? 未知#" + s.connId);
          }
          return new Response(JSON.stringify(users), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        case "/users-detail": {
          let users = [];
          for (let s of this.sessions.values()) {
            if (s.name) users.push({name: s.name, ip: s.ip || ""});
            else users.push({name: "? 未知#" + s.connId, ip: s.ip || ""});
          }
          return new Response(JSON.stringify(users), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        case "/files": {
          let entries = await this.storage.list({reverse: true, limit: 100});
          let files = [];
          for (let [key, val] of entries) {
            try {
              let msg = JSON.parse(val);
              if (msg.type === "file") {
                files.push({
                  timestamp: msg.timestamp,
                  name: msg.name,
                  fileName: msg.fileName,
                  fileSize: msg.fileSize,
                  fileType: msg.fileType,
                  tag: msg.tag,
                  tagColor: msg.tagColor,
                  tagBorder: msg.tagBorder || ""
                });
              }
            } catch (e) {}
          }
          return new Response(JSON.stringify(files), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        case "/file-data": {
          let ts = url.searchParams.get("timestamp");
          if (!ts) return new Response("请提供时间戳", {status: 400});
          let key = new Date(parseInt(ts)).toISOString();
          let val = await this.storage.get(key);
          if (!val) return new Response("未找到文件", {status: 404});
          return new Response(val, {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        case "/messages": {
          let limit = parseInt(url.searchParams.get("limit")) || 50;
          if (limit > 200) limit = 200;
          let before = url.searchParams.get("before"); // 时间戳游标
          let entries;
          if (before) {
            let beforeKey = new Date(parseInt(before)).toISOString();
            entries = await this.storage.list({reverse: true, limit: limit, start: beforeKey});
          } else {
            entries = await this.storage.list({reverse: true, limit: limit});
          }
          let msgs = [];
          for (let [key, val] of entries) {
            try {
              let msg = JSON.parse(val);
              if (msg.type !== "file") {
                msgs.push({
                  timestamp: msg.timestamp,
                  name: msg.name,
                  message: msg.message,
                  type: msg.type,
                  tag: msg.tag,
                  tagColor: msg.tagColor,
                  tagBorder: msg.tagBorder || "",
                  color: msg.color,
                  fileName: msg.fileName,
                  fileSize: msg.fileSize
                });
              }
            } catch (e) {}
          }
          msgs.reverse();
          return new Response(JSON.stringify(msgs), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        case "/export": {
          let format = url.searchParams.get("format") || "json";
          let entries = await this.storage.list({reverse: false});
          let msgs = [];
          for (let [key, val] of entries) {
            try {
              let msg = JSON.parse(val);
              if (msg && (msg.type === undefined || msg.type === "text" || msg.type === "image" || msg.type === "file" || msg.type === "zifu")) {
                msgs.push(msg);
              }
            } catch (e) {}
          }
          if (format === "txt") {
            let text = msgs.map(m => {
              let ts = m.timestamp ? new Date(m.timestamp).toLocaleString() : "";
              let tagText = m.tag ? "[" + m.tag + "]" : "";
              let content = m.message || (m.type === "image" ? "[图片]" : m.type === "file" ? "[文件] " + m.fileName : "");
              return "[" + ts + "] " + tagText + m.name + ": " + content;
            }).join("\r\n");
            return new Response(text, {status: 200, headers: {
              "Content-Type": "text/plain;charset=utf-8",
              "Content-Disposition": "attachment; filename=chatlog_" + (this.roomName || "export") + ".txt"
            }});
          } else {
            return new Response(JSON.stringify(msgs, null, 2), {status: 200, headers: {
              "Content-Type": "application/json;charset=utf-8",
              "Content-Disposition": "attachment; filename=chatlog_" + (this.roomName || "export") + ".json"
            }});
          }
        }

        case "/broadcast-message": {
          let text = url.searchParams.get("text");
          let sender = url.searchParams.get("sender") || "系统公告";
          if (!text) return new Response("请提供消息内容", {status: 400});

          let timestamp = Date.now();
          let data = {
            type: "text",
            message: text,
            name: sender,
            timestamp: Math.max(timestamp, this.lastTimestamp + 1),
            tag: "📢",
            tagColor: "red",
            tagBorder: "",
            admin: true
          };
          data.id = ++this.msgCounter;
          this.lastTimestamp = data.timestamp;
          let dataStr = JSON.stringify(data);
          this.broadcast(dataStr);
          let key = new Date(data.timestamp).toISOString();
          await this.storage.put(key, dataStr);
          return new Response("消息已发送到房间 " + (this.roomName || "未知"), {status: 200});
        }

        case "/do-kick": {
          let targetName = url.searchParams.get("name");
          let callerName = url.searchParams.get("caller") || "";
          if (!targetName) return new Response("请提供用户名", {status: 400});
          if (targetName === callerName) {
            return new Response("不能踢出自己", {status: 400});
          }

          // 检查VIP踢出保护（全局机制，管理员也不能绕过）
          for (let [ws, s] of this.sessions) {
            if (s.name === targetName && s.vip && s.vip.features && s.vip.features.kickProtect) {
              return new Response("受保护，无法踢出", {status: 403});
            }
          }
          // 检查全局踢出保护名单
          if (this.env.registry) {
            try {
              let registryId = this.env.registry.idFromName("global");
              let stub = this.env.registry.get(registryId);
              let checkRes = await stub.fetch(new URL("https://dummy-url/is-kick-protected?name=" + encodeURIComponent(targetName)));
              let checkData = await checkRes.json();
              if (checkData.protected) {
                return new Response(targetName + " 受保护，无法踢出", {status: 403});
              }
            } catch (e) {}
          }

          let kickedWs = null;
          let ghostMatch = targetName.match(/^\?\s*未知#(\d+)$/);
          if (ghostMatch) {
            let targetConnId = parseInt(ghostMatch[1]);
            for (let [ws, s] of this.sessions) {
              if (s.connId === targetConnId && !s.name) {
                kickedWs = ws;
                break;
              }
            }
          } else {
            for (let [ws, s] of this.sessions) {
              if (s.name === targetName) {
                kickedWs = ws;
                break;
              }
            }
          }

          if (kickedWs) {
            this.sessions.delete(kickedWs);
            kickedWs.close(1000, "kicked");
            this.broadcast({kicked: targetName});
            await this.updateRegistry();
            return new Response("已踢出 " + targetName, {status: 200});
          }
          return new Response("未找到用户 " + targetName, {status: 404});
        }

        case "/do-clear": {
          await this.clearAllMessages();
          return new Response("聊天记录已清空。", { status: 200 });
        }

        case "/do-destroy": {
          // 一键销毁房间：清空消息、断开所有连接
          this.destroyed = true;
          await this.clearAllMessages();
          this.sessions.forEach((session, webSocket) => {
            try { webSocket.close(1000, "房间已销毁"); } catch (e) {}
          });
          this.sessions.clear();
          // registry 删除由管理 API 层直接处理
          return new Response("房间 " + (this.roomName || "未知") + " 已销毁", { status: 200 });
        }

        case "/message/recall": {
          let recallTs = url.searchParams.get("timestamp");
          let recallName = url.searchParams.get("name");
          if (!recallTs || !recallName) return new Response("缺少参数", {status: 400});
          let recallKey = new Date(parseInt(recallTs)).toISOString();
          let recallOrig = await this.storage.get(recallKey);
          if (recallOrig) {
            try {
              let origData = JSON.parse(recallOrig);
              if (origData.name !== recallName) {
                return new Response("无权撤回他人的消息", {status: 403});
              }
              let now = Date.now();
              if (now - parseInt(recallTs) > 120000) {
                return new Response("超过2分钟无法撤回", {status: 400});
              }
            } catch (e) {}
          }
          let recalledMsg = JSON.stringify({type: "recalled", name: recallName, timestamp: parseInt(recallTs)});
          await this.storage.put(recallKey, recalledMsg);
          this.broadcast(recalledMsg);
          return new Response("ok", {status: 200});
        }

        case "/tag-update": {
          let targetName = url.searchParams.get("name");
          let newTag = url.searchParams.get("tag") || "";
          let newColor = url.searchParams.get("color") || "";
          let newBorder = url.searchParams.get("border") || "";
          if (!targetName) return new Response("请提供用户名", {status: 400});

          for (let [ws, s] of this.sessions) {
            if (s.name === targetName) {
              s.tag = newTag;
              s.tagColor = newColor;
              s.tagBorder = newBorder;
              break;
            }
          }

          this.broadcast({type: "tag-update", name: targetName, tag: newTag, tagColor: newColor, tagBorder: newBorder});
          return new Response("ok", {status: 200});
        }

        case "/set-announcement": {
          let annText = url.searchParams.get("text") || "";
          this.announcement = annText;
          await this.storage.put("announcement", annText);
          this.broadcast({type: "announcement", text: annText});
          return new Response("公告已" + (annText ? "更新" : "清除"), {status: 200});
        }

        case "/get-announcement": {
          return new Response(JSON.stringify({text: this.announcement || ""}), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        case "/get-pinned": {
          return new Response(JSON.stringify({pinned: this.pinnedMessage}), {
            status: 200, headers: {"Content-Type": "application/json"}
          });
        }

        default:
          return new Response("未找到", {status: 404});
      }
    });
  }

  async clearAllMessages() {
    let allEntries = await this.storage.list();
    let msgKeys = [];
    for (let [key, val] of allEntries) {
      try {
        let parsed = JSON.parse(val);
        if (parsed && parsed.type && ["message", "image", "file", "reply", "zifu"].includes(parsed.type)) {
          msgKeys.push(key);
        }
      } catch (e) {}
    }
    if (msgKeys.length > 0) {
      await this.storage.delete(msgKeys);
    }
    console.log(`Durable Object ID: ${this.state.id} - 清空了 ${msgKeys.length} 条聊天记录。`);
    this.lastTimestamp = 0;
    this.broadcast({type: "room-cleared"});
  }

  async handleSession(webSocket, ip) {
    // 房间已销毁，拒绝新连接
    if (this.destroyed) {
      webSocket.close(1000, "房间已销毁");
      return;
    }
    this.state.acceptWebSocket(webSocket);

    this.connCounter++;
    let connId = this.connCounter;
    let session = { blockedMessages: [], ip, connId };
    webSocket.serializeAttachment({ ...webSocket.deserializeAttachment(), ip, connId });
    this.sessions.set(webSocket, session);

    for (let otherSession of this.sessions.values()) {
      if (otherSession.name) {
        let msg = {joined: otherSession.name};
        if (otherSession.tag) msg.tag = otherSession.tag;
        if (otherSession.tagColor) msg.tagColor = otherSession.tagColor;
        if (otherSession.tagBorder) msg.tagBorder = otherSession.tagBorder;
        if (otherSession.vip) msg.vip = otherSession.vip;
        session.blockedMessages.push(JSON.stringify(msg));
      }
    }

    let storage = await this.storage.list({reverse: true, limit: 50});
    let backlog = [...storage.values()];
    backlog.reverse();
    backlog.forEach(value => {
      session.blockedMessages.push(value);
    });

    if (this._loadAnnouncement) await this._loadAnnouncement;
    if (this.announcement) {
      session.blockedMessages.push(JSON.stringify({type: "announcement", text: this.announcement}));
    }

    if (this._loadPinned) await this._loadPinned;
    if (this.pinnedMessage) {
      session.blockedMessages.push(JSON.stringify({type: "pinned", pinned: this.pinnedMessage}));
    }

    if (this._loadPolls) await this._loadPolls;
    if (this.polls && this.polls.size > 0) {
      for (let [pollId, poll] of this.polls) {
        session.blockedMessages.push(JSON.stringify({
          type: "poll",
          pollId: pollId,
          question: poll.question,
          options: poll.options.map(o => ({index: o.index, text: o.text})),
          creator: poll.creator,
          timestamp: poll.timestamp
        }));
      }
    }

    if (this._loadHighlights) await this._loadHighlights;
    if (this.highlights && this.highlights.length > 0) {
      session.blockedMessages.push(JSON.stringify({type: "highlights-update", highlights: this.highlights}));
    }

    if (this._loadReactions) await this._loadReactions;
    if (this.reactions && Object.keys(this.reactions).length > 0) {
      for (let [rKey, rData] of Object.entries(this.reactions)) {
        if (Object.keys(rData).length > 0) {
          session.blockedMessages.push(JSON.stringify({type: "reaction-update", msgTimestamp: rKey, reactions: rData}));
        }
      }
    }

    if (this._loadRelays) await this._loadRelays;
    if (this.relays && this.relays.size > 0) {
      for (let [, relay] of this.relays) {
        if (relay.active) {
          session.blockedMessages.push(JSON.stringify({
            type: "relay-new", relayId: relay.id, topic: relay.topic,
            startedBy: relay.startedBy, startedAt: relay.startedAt
          }));
          relay.entries.forEach(entry => {
            session.blockedMessages.push(JSON.stringify({
              type: "relay-update", relayId: relay.id, entry, totalCount: relay.entries.length
            }));
          });
        }
      }
    }

    this.updateRegistry();
  }

  async updateRegistry() {
    if (!this.roomName || !this.env.registry || this.destroyed) return;
    try {
      let registryId = this.env.registry.idFromName("global");
      let stub = this.env.registry.get(registryId);
      let count = 0;
      for (let s of this.sessions.values()) {
        if (s.name) count++;
      }
      await stub.fetch("https://dummy-url/update?name=" + encodeURIComponent(this.roomName) + "&count=" + count);
    } catch (e) {}
  }

  async webSocketMessage(webSocket, msg) {
    try {
      let session = this.sessions.get(webSocket);
      if (session.quit) {
        webSocket.close(1011, "WebSocket 已损坏");
        return;
      }

      let data = JSON.parse(msg);

      if (!session.name) {
        let rawName = "" + (data.name || "匿名");

        if (rawName.length > 32) {
          webSocket.send(JSON.stringify({error: "名称过长"}));
          webSocket.close(1009, "名称过长");
          return;
        }

        // 🔒 用户名过滤：排除 HTML 特殊字符，防止存储型 XSS（允许中文/emoji）
        if (/[<>&"'\\]/.test(rawName)) {
          webSocket.send(JSON.stringify({error: "名称包含非法字符"}));
          webSocket.close(1009, "名称包含非法字符");
          return;
        }

        session.name = rawName;
        webSocket.serializeAttachment({ ...webSocket.deserializeAttachment(), name: session.name });

        try {
          let registryId = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(registryId);
          let initUrl = "https://dummy-url/user-init?name=" + encodeURIComponent(session.name) +
            "&ip=" + encodeURIComponent(session.ip || "") +
            "&token=" + encodeURIComponent(data.token || "");
          let initRes = await stub.fetch(initUrl);
          let initData = await initRes.json();

          if (initData.banned) {
            webSocket.send(JSON.stringify({error: "你已被封禁，无法加入聊天室"}));
            webSocket.close(1000, "banned");
            return;
          }
          if (initData.ipBanned) {
            webSocket.send(JSON.stringify({error: "你的IP已被封禁，无法加入聊天室"}));
            webSocket.close(1000, "banned");
            return;
          }
          if (initData.registered && !initData.authenticated) {
            webSocket.send(JSON.stringify({error: "该名称已注册，请登录后使用"}));
            webSocket.close(1000, "unauthorized");
            return;
          }

          if (initData.tag) {
            session.tag = initData.tag;
            session.tagColor = initData.color || "";
            session.tagBorder = initData.border || "";
          } else {
            session.tag = "USER";
            session.tagColor = "blue";
            session.tagBorder = "";
          }
          if (initData.vip) {
            session.vip = initData.vip;
          }
          if (initData.avatar) {
            session.avatar = initData.avatar;
          }
          if (initData.bio) {
            session.bio = initData.bio;
          }
        } catch (e) {
          session.tag = "";
          session.tagColor = "";
          session.tagBorder = "";
        }
        webSocket.serializeAttachment({ ...webSocket.deserializeAttachment(), tag: session.tag, tagColor: session.tagColor, tagBorder: session.tagBorder, vip: session.vip, avatar: session.avatar });

        session.blockedMessages.forEach(queued => {
          webSocket.send(queued);
        });
        delete session.blockedMessages;

        let joinMsg = {joined: session.name};
        if (session.tag) joinMsg.tag = session.tag;
        if (session.tagColor) joinMsg.tagColor = session.tagColor;
        if (session.tagBorder) joinMsg.tagBorder = session.tagBorder;
        if (session.vip) joinMsg.vip = session.vip;
        if (session.avatar) joinMsg.avatar = session.avatar;
        this.broadcast(joinMsg);

        this.updateRegistry();

        webSocket.send(JSON.stringify({ready: true}));
        return;
      }

      if (data.type === "kick") {
        if (this.blacklist.has(session.name)) {
          webSocket.send(JSON.stringify({error: "你已被加入黑名单，无法踢人"}));
          return;
        }

        try {
          let registryId = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(registryId);
          let gbCheck = await stub.fetch("https://dummy-url/is-globally-blacklisted?name=" + encodeURIComponent(session.name));
          let gbResult = await gbCheck.json();
          if (gbResult.blacklisted) {
            webSocket.send(JSON.stringify({error: "你已被全局拉黑，无法踢人"}));
            return;
          }
        } catch (e) {}

        let targetName = data.target;
        if (!targetName) {
          webSocket.send(JSON.stringify({error: "未指定要踢出的用户"}));
          return;
        }

        if (targetName === session.name) {
          webSocket.send(JSON.stringify({error: "不能踢出自己"}));
          return;
        }

        for (let [ws, s] of this.sessions) {
          if (s.name === targetName && s.vip && s.vip.features && s.vip.features.kickProtect) {
            webSocket.send(JSON.stringify({error: "受保护，无法踢出"}));
            return;
          }
        }

        // 检查全局保护名单
        try {
          let registryId = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(registryId);
          let checkRes = await stub.fetch(new URL("https://dummy-url/is-kick-protected?name=" + encodeURIComponent(targetName)));
          let checkData = await checkRes.json();
          if (checkData.protected) {
            webSocket.send(JSON.stringify({error: targetName + " 受保护，无法踢出"}));
            return;
          }
        } catch (e) {}

        let kickedEntry = null;
        for (let [ws, s] of this.sessions) {
          if (s.name === targetName) {
            kickedEntry = {ws, s};
            break;
          }
        }

        if (kickedEntry) {
          this.sessions.delete(kickedEntry.ws);
          kickedEntry.ws.close(1000, "kicked");
          this.broadcast({kicked: targetName});
          webSocket.send(JSON.stringify({system: "你已将 " + targetName + " 踢出房间"}));
        } else {
          webSocket.send(JSON.stringify({error: "未找到用户 " + targetName}));
        }
        return;
      }

      if (data.type === "whisper") {
        let targetName = "" + data.target;
        let whisperMsg = "" + data.message;
        if (!targetName || !whisperMsg) {
          webSocket.send(JSON.stringify({error: "私聊格式错误"}));
          return;
        }
        let whisperMax = (session.vip && session.vip.features ? session.vip.features.maxMsgLen : 256);
        if (whisperMsg.length > whisperMax) {
          webSocket.send(JSON.stringify({error: "消息过长（VIP最高 " + whisperMax + " 字）"}));
          return;
        }

        let found = false;
        this.sessions.forEach((s, ws) => {
          if (s.name === targetName) {
            ws.send(JSON.stringify({
              type: "whisper",
              from: session.name,
              message: whisperMsg,
              timestamp: Math.max(Date.now(), this.lastTimestamp + 1)
            }));
            found = true;
          }
        });

        webSocket.send(JSON.stringify({
          type: "whisper",
          from: session.name,
          to: targetName,
          message: whisperMsg,
          timestamp: Math.max(Date.now(), this.lastTimestamp + 1)
        }));

        if (!found) {
          webSocket.send(JSON.stringify({error: "用户 " + targetName + " 不在线"}));
        }
        return;
      }

      if (data.type === "typing") {
        this.broadcast({type: "typing", name: session.name});
        return;
      }

      if (await handleMedia(this, session, data, webSocket)) return;

      if (data.type === "poll-create") {
        if (this._loadPolls) await this._loadPolls;
        let question = "" + data.question;
        let options = data.options;
        if (!question || !Array.isArray(options) || options.length < 2 || options.length > 10) {
          webSocket.send(JSON.stringify({error: "投票需要2-10个选项"}));
          return;
        }
        if (question.length > 200) {
          webSocket.send(JSON.stringify({error: "问题过长"}));
          return;
        }
        let pollId = "poll_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        let poll = {
          id: pollId,
          question: question,
          options: options.map((text, i) => ({index: i, text: "" + text, votes: []})),
          creator: session.name,
          timestamp: Math.max(Date.now(), this.lastTimestamp + 1),
          voters: {}
        };
        this.polls.set(pollId, poll);
        await this.storage.put("polls", [...this.polls]);
        this.broadcast({
          type: "poll",
          pollId: pollId,
          question: question,
          options: options.map((text, i) => ({index: i, text: "" + text})),
          creator: session.name,
          timestamp: poll.timestamp
        });
        return;
      }

      if (data.type === "poll-vote") {
        let pollId = data.pollId;
        let optionIndex = parseInt(data.optionIndex, 10);
        if (!pollId || isNaN(optionIndex)) {
          webSocket.send(JSON.stringify({error: "投票参数错误"}));
          return;
        }
        if (this._loadPolls) await this._loadPolls;
        let poll = this.polls.get(pollId);
        if (!poll) {
          webSocket.send(JSON.stringify({error: "投票不存在"}));
          return;
        }
        if (poll.voters[session.name] !== undefined) {
          webSocket.send(JSON.stringify({error: "你已经投过票了"}));
          return;
        }
        if (optionIndex < 0 || optionIndex >= poll.options.length) {
          webSocket.send(JSON.stringify({error: "选项不存在"}));
          return;
        }
        poll.voters[session.name] = optionIndex;
        poll.options[optionIndex].votes.push(session.name);
        await this.storage.put("polls", [...this.polls]);
        this.broadcast({
          type: "poll-update",
          pollId: pollId,
          options: poll.options.map(o => ({index: o.index, text: o.text, count: o.votes.length})),
          totalVoters: Object.keys(poll.voters).length
        });
        return;
      }

      if (data.type === "schedule") {
        if (this._loadScheduled) await this._loadScheduled;
        let schedMsg = "" + data.message;
        let schedTime = parseInt(data.time, 10);
        if (!schedMsg || !schedTime || schedTime <= Date.now()) {
          webSocket.send(JSON.stringify({error: "定时时间必须在未来"}));
          return;
        }
        if (schedTime > Date.now() + 7 * 24 * 3600 * 1000) {
          webSocket.send(JSON.stringify({error: "定时时间不能超过7天"}));
          return;
        }
        let maxLen = (session.vip && session.vip.features ? session.vip.features.maxMsgLen : 256);
        if (schedMsg.length > maxLen) {
          webSocket.send(JSON.stringify({error: "消息过长"}));
          return;
        }
        if (!this.scheduledMessages) this.scheduledMessages = [];
        let schedEntry = {
          id: "sched_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
          name: session.name,
          message: schedMsg,
          time: schedTime,
          createdAt: Date.now(),
          tag: session.tag || "",
          tagColor: session.tagColor || "",
          tagBorder: session.tagBorder || ""
        };
        this.scheduledMessages.push(schedEntry);
        await this.storage.put("scheduledMessages", this.scheduledMessages);
        let nearest = Math.min(...this.scheduledMessages.map(s => s.time));
        await this.state.storage.setAlarm(nearest);
        webSocket.send(JSON.stringify({type: "schedule-confirm", id: schedEntry.id, time: schedTime}));
        return;
      }

      if (data.type === "schedule-cancel") {
        let cancelId = data.id;
        if (!cancelId) { webSocket.send(JSON.stringify({error: "缺少定时消息ID"})); return; }
        if (this._loadScheduled) await this._loadScheduled;
        this.scheduledMessages = (this.scheduledMessages || []).filter(s => s.id !== cancelId);
        await this.storage.put("scheduledMessages", this.scheduledMessages);
        if (this.scheduledMessages.length > 0) {
          let nearest = Math.min(...this.scheduledMessages.map(s => s.time));
          await this.state.storage.setAlarm(nearest);
        }
        webSocket.send(JSON.stringify({type: "schedule-cancel-confirm", id: cancelId}));
        return;
      }

      if (data.type === "relay-create") {
        let topic = "" + (data.topic || "");
        if (!topic || topic.length > 100) {
          webSocket.send(JSON.stringify({error: "接龙主题不能为空且不超过100字"}));
          return;
        }
        if (this._loadRelays) await this._loadRelays;
        for (let [, relay] of this.relays) {
          if (relay.active) {
            webSocket.send(JSON.stringify({error: "已存在进行中的接龙: " + relay.topic + "，请先结束"}));
            return;
          }
        }
        let relayId = "relay_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        this.relays.set(relayId, {
          id: relayId, topic: topic, entries: [], active: true,
          startedBy: session.name, startedAt: Date.now()
        });
        await this.storage.put("relays", [...this.relays]);
        this.broadcast({
          type: "relay-new", relayId: relayId, topic: topic,
          startedBy: session.name, startedAt: Date.now()
        });
        return;
      }

      if (data.type === "relay-add") {
        let relayId = data.relayId;
        let content = "" + (data.content || "");
        let number = parseInt(data.number, 10);
        if (!relayId || !content || isNaN(number)) {
          webSocket.send(JSON.stringify({error: "接龙参数错误"}));
          return;
        }
        if (this._loadRelays) await this._loadRelays;
        let relay = this.relays.get(relayId);
        if (!relay) { webSocket.send(JSON.stringify({error: "接龙不存在"})); return; }
        if (!relay.active) { webSocket.send(JSON.stringify({error: "接龙已结束"})); return; }
        if (number !== relay.entries.length + 1) {
          webSocket.send(JSON.stringify({error: "顺序错误，当前轮到第 " + (relay.entries.length + 1) + " 个"}));
          return;
        }
        if (content.length > 200) { webSocket.send(JSON.stringify({error: "内容过长（最多200字）"})); return; }
        relay.entries.push({number, user: session.name, content, timestamp: Date.now()});
        await this.storage.put("relays", [...this.relays]);
        this.broadcast({type: "relay-update", relayId, entry: {number, user: session.name, content, timestamp: Date.now()}, totalCount: relay.entries.length});
        return;
      }

      if (data.type === "relay-end") {
        let relayId = data.relayId;
        if (this._loadRelays) await this._loadRelays;
        let relay = this.relays.get(relayId);
        if (!relay) { webSocket.send(JSON.stringify({error: "接龙不存在"})); return; }
        if (relay.startedBy !== session.name) {
          webSocket.send(JSON.stringify({error: "只有发起者可以结束接龙"})); return;
        }
        relay.active = false;
        await this.storage.put("relays", [...this.relays]);
        this.broadcast({type: "relay-ended", relayId, totalCount: relay.entries.length, endedBy: session.name});
        return;
      }

      if (data.type === "relay-list") {
        if (this._loadRelays) await this._loadRelays;
        let activeRelays = [];
        for (let [, relay] of this.relays) {
          if (relay.active) {
            activeRelays.push({
              id: relay.id, topic: relay.topic, startedBy: relay.startedBy,
              startedAt: relay.startedAt, entryCount: relay.entries.length,
              nextNumber: relay.entries.length + 1
            });
          }
        }
        webSocket.send(JSON.stringify({type: "relay-list-result", relays: activeRelays}));
        return;
      }

      if (data.type === "reaction") {
        if (this._loadReactions) await this._loadReactions;
        let rKey = "" + data.msgTimestamp;
        if (!rKey) { webSocket.send(JSON.stringify({error: "缺少消息时间戳"})); return; }
        // 防止原型污染：阻止 __proto__、constructor、prototype 作为键
        let emoji = ("" + data.emoji).trim();
        if (!emoji || emoji === "__proto__" || emoji === "constructor" || emoji === "prototype") {
          webSocket.send(JSON.stringify({error: "无效的表情"}));
          return;
        }
        if (!this.reactions[rKey] || typeof this.reactions[rKey] !== "object") this.reactions[rKey] = {};
        if (data.action === "remove") {
          if (this.reactions[rKey][emoji]) {
            this.reactions[rKey][emoji] = (this.reactions[rKey][emoji] || []).filter(u => u !== session.name);
            if (this.reactions[rKey][emoji].length === 0) delete this.reactions[rKey][emoji];
            if (Object.keys(this.reactions[rKey]).length === 0) delete this.reactions[rKey];
          }
        } else {
          if (!this.reactions[rKey][emoji]) this.reactions[rKey][emoji] = [];
          if (!this.reactions[rKey][emoji].includes(session.name)) this.reactions[rKey][emoji].push(session.name);
        }
        await this.storage.put("reactions", JSON.stringify(this.reactions));
        this.broadcast({type: "reaction-update", msgTimestamp: rKey, reactions: this.reactions[rKey] || {}});
        return;
      }

      // ====== 红包 ======
      if (data.type === "redpacket") {
        try {
          let registryId = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(registryId);
          if (data.action === "create") {
            let total = parseInt(data.total) || 0;
            let count = parseInt(data.count) || 0;
            let mode = data.mode || "random";
            if (total < 1 || count < 1) { webSocket.send(JSON.stringify({error: "参数无效"})); return; }
            let r = await stub.fetch("https://dummy-url/redpacket/create", {
              method: "POST",
              body: JSON.stringify({creator: session.name, total, count, mode, room: this.roomName}),
              headers: {"Content-Type": "application/json"}
            });
            let result = await r.json();
            if (result.ok) {
              let rp = result.redpacket;
              let msg = {
                type: "redpacket",
                action: "new",
                id: rp.id, creator: rp.creator,
                total: rp.total, count: rp.count, mode: rp.mode,
                remaining: rp.remaining, remainingCount: rp.remainingCount,
                timestamp: Math.max(Date.now(), this.lastTimestamp + 1),
                name: session.name,
                tag: session.tag || "",
                tagColor: session.tagColor || "",
                tagBorder: session.tagBorder || ""
              };
              msg.id = ++this.msgCounter;
              this.lastTimestamp = msg.timestamp;
              this.broadcast(JSON.stringify(msg));
              // 不存storage（红包消息不持久化）
            } else {
              webSocket.send(JSON.stringify({error: result.error || "红包创建失败"}));
            }
          } else if (data.action === "grab") {
            let rpId = data.id;
            if (!rpId) { webSocket.send(JSON.stringify({error: "缺少红包ID"})); return; }
            let r = await stub.fetch("https://dummy-url/redpacket/grab", {
              method: "POST",
              body: JSON.stringify({id: rpId, user: session.name}),
              headers: {"Content-Type": "application/json"}
            });
            let result = await r.json();
            if (result.ok) {
              // 抢到红包，广播结果
              this.broadcast({
                type: "redpacket",
                action: "grabbed",
                id: rpId,
                user: session.name,
                amount: result.amount,
                remaining: result.remaining,
                remainingCount: result.remainingCount,
                creator: result.creator,
                isFinished: result.isFinished
              });
            } else {
              webSocket.send(JSON.stringify({error: result.error || "领取失败"}));
            }
          } else if (data.action === "info") {
            let r = await stub.fetch(new URL("https://dummy-url/redpacket/info?id=" + encodeURIComponent(data.id || "")));
            let info = await r.json();
            webSocket.send(JSON.stringify({type: "redpacket", action: "info", id: data.id, info}));
          }
        } catch (e) {
          webSocket.send(JSON.stringify({error: "红包系统暂时不可用"}));
        }
        return;
      }

      if (await handleManage(this, session, data, webSocket)) return;

      let msgColor = data.color;
      let replyData = data.reply;
      let atAll = data.atAll;
      data = { name: session.name, message: "" + data.message };
      if (session.tag) data.tag = session.tag;
      if (session.tagColor) data.tagColor = session.tagColor;
      if (session.tagBorder) data.tagBorder = session.tagBorder;
      if (session.avatar) data.avatar = session.avatar;
      if (msgColor) data.color = msgColor;
      if (replyData) data.reply = replyData;
      if (atAll) data.atAll = true;

      let maxMsgLen = (session.vip && session.vip.features ? session.vip.features.maxMsgLen : 256);
      if (data.message.length > maxMsgLen) {
        webSocket.send(JSON.stringify({error: "消息过长（VIP最高 " + maxMsgLen + " 字）"}));
        return;
      }

      if (this.containsProfanity(data.message)) {
        webSocket.send(JSON.stringify({error: "检测到辱骂内容，已自动封禁"}));
        try {
          let registryId = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(registryId);
          await stub.fetch("https://dummy-url/ban?name=" + encodeURIComponent(session.name));
          let ip = session.ip || "";
          if (ip) {
            await stub.fetch("https://dummy-url/ip-ban?ip=" + encodeURIComponent(ip));
          }
        } catch (e) {}
        webSocket.close(1000, "banned");
        this.broadcast({kicked: session.name});
        return;
      }

      // 检测 @bot 或 /bot 命令
      let botMatch = data.message.match(/^[@\/]bot\s+(.+)/i);
      if (botMatch) {
        try {
          let registryId = this.env.registry.idFromName("global");
          let stub = this.env.registry.get(registryId);
          let cmdKeyword = botMatch[1].trim().split(/\s+/)[0];

          // help 命令 - 列出所有可用命令
          if (cmdKeyword === "help") {
            let listResp = await stub.fetch("https://dummy-url/bot-commands?action=list");
            let cmds = await listResp.json();
            let enabled = cmds.filter(c => c.enabled !== false);
            let helpText = enabled.length > 0 ? "可用命令: " + enabled.map(c => c.keyword).join(", ") : "暂无可用命令";
            let helpMsg = {name: "Bot", message: helpText, tag: "🤖", tagColor: "green", timestamp: Math.max(Date.now(), this.lastTimestamp + 1), id: ++this.msgCounter};
            this.lastTimestamp = helpMsg.timestamp;
            this.broadcast(JSON.stringify(helpMsg));
            let helpKey = new Date(helpMsg.timestamp).toISOString();
            await this.storage.put(helpKey, JSON.stringify(helpMsg));
            return;
          }

          let botResp = await stub.fetch("https://dummy-url/bot-commands?action=get&keyword=" + encodeURIComponent(cmdKeyword));
          if (botResp.ok) {
            let cmdData = await botResp.json();
            if (cmdData.enabled !== false && cmdData.response) {
              let botMsg = {name: "Bot", message: cmdData.response, tag: "🤖", tagColor: "green", timestamp: Math.max(Date.now(), this.lastTimestamp + 1), id: ++this.msgCounter};
              this.lastTimestamp = botMsg.timestamp;
              this.broadcast(JSON.stringify(botMsg));
              let key = new Date(botMsg.timestamp).toISOString();
              await this.storage.put(key, JSON.stringify(botMsg));
              return;
            }
          }
          webSocket.send(JSON.stringify({error: "未知命令，输入 /bot help 查看可用命令"}));
        } catch (e) {
          webSocket.send(JSON.stringify({error: "机器人暂时不可用"}));
        }
        return;
      }

      // 检测 /ai 或 @ai 命令 — 调用 AI API
      let aiMatch = data.message.match(/^[@\/]ai\s+(.+)/i);
      if (aiMatch) {
        try {
          // 先把用户的消息广播出去
          data.timestamp = Math.max(Date.now(), this.lastTimestamp + 1);
          this.lastTimestamp = data.timestamp;
          data.id = ++this.msgCounter;
          this.messages.set(data.id, data);
          let dataStr = JSON.stringify(data);
          this.broadcast(dataStr);
          await this.storage.put(new Date(data.timestamp).toISOString(), dataStr);

          let userPrompt = aiMatch[1].trim();
          if (!userPrompt) {
            webSocket.send(JSON.stringify({error: "请输入你想问的问题，例如：/ai 你好"}));
            return;
          }
          let resp = await fetch(this.env.AI_BASE_URL + "/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + this.env.AI_API_KEY
            },
            body: JSON.stringify({
              model: this.env.AI_MODEL || "deepseek-chat",
              messages: [
                {role: "system", content: this.env.AI_SYSTEM_PROMPT || "你是一个友好的助手"},
                {role: "user", content: userPrompt}
              ],
              max_tokens: 2000
            })
          });
          if (!resp.ok) {
            let errText = await resp.text();
            throw new Error("API " + resp.status + ": " + errText.slice(0, 200));
          }
          let aiData = await resp.json();
          let aiText = aiData.choices?.[0]?.message?.content || "AI 返回了空回复";
          let aiMsg = {
            name: "AI", message: aiText, tag: "🤖", tagColor: "blue",
            timestamp: Math.max(Date.now(), this.lastTimestamp + 1), id: ++this.msgCounter
          };
          this.lastTimestamp = aiMsg.timestamp;
          this.broadcast(JSON.stringify(aiMsg));
          let key = new Date(aiMsg.timestamp).toISOString();
          await this.storage.put(key, JSON.stringify(aiMsg));
        } catch (e) {
          webSocket.send(JSON.stringify({error: "AI 请求失败: " + e.message}));
        }
        return;
      }

      data.timestamp = Math.max(Date.now(), this.lastTimestamp + 1);
      this.lastTimestamp = data.timestamp;
      data.id = ++this.msgCounter;
      this.messages.set(data.id, data);

      let dataStr = JSON.stringify(data);
      this.broadcast(dataStr);

      let key = new Date(data.timestamp).toISOString();
      await this.storage.put(key, dataStr);
    } catch (err) {
      console.error("webSocketMessage 异常:", err.stack || err);
      webSocket.send(JSON.stringify({error: "消息处理错误"}));
    }
  }

  async closeOrErrorHandler(webSocket) {
    let session = this.sessions.get(webSocket) || {};
    session.quit = true;
    this.sessions.delete(webSocket);
    if (session.name) {
      this.broadcast({quit: session.name});
    }
    this.updateRegistry();
  }

  async webSocketClose(webSocket, code, reason, wasClean) {
    this.closeOrErrorHandler(webSocket)
  }

  async webSocketError(webSocket, error) {
    this.closeOrErrorHandler(webSocket)
  }

  containsProfanity(text) {
    const t = text.replace(/[^a-z一-鿿]/gi, "").toLowerCase();
    const roots = [
      "草泥马", "草你妈", "操你妈", "操你妈", "肏你妈",
      "傻逼", "傻比", "煞笔", "沙比", "撒比",
      "你妈逼", "尼玛逼", "尼玛", "你妈",
      "死全家", "全家死", "去死",
      "废物", "垃圾", "杂种", "狗日", "狗娘",
      "操你", "日你", "干你",
      "他妈", "特么", "他娘",
      "滚蛋", "滚粗", "滚开",
      "吃屎", "放屁", "放狗屁",
      "脑残", "智障", "弱智",
      "妓女", "婊子", "贱人", "骚货",
      "cnm", "nmb", "sb", "qnmd",
      "wqnmlgb", "qnmlgb",
      "fuck", "shit", "bitch", "asshole",
    ];
    const homophones = {
      "艹": "操", "曹": "操", "草": "操",
      "吗": "妈", "骂": "妈", "麻": "妈",
      "笔": "逼", "碧": "逼", "璧": "逼", "比": "逼",
      "莎": "傻", "啥": "傻", "厦": "傻",
      "币": "逼",
    };
    let normalized = "";
    for (const ch of t) {
      normalized += homophones[ch] || ch;
    }
    for (const root of roots) {
      if (normalized.includes(root)) return true;
    }
    return false;
  }

  async alarm() {
    if (this._loadScheduled) await this._loadScheduled;
    let now = Date.now();
    let toSend = this.scheduledMessages.filter(s => s.time <= now);
    this.scheduledMessages = this.scheduledMessages.filter(s => s.time > now);
    for (let s of toSend) {
      let data = {
        name: s.name,
        message: s.message,
        timestamp: Math.max(Date.now(), this.lastTimestamp + 1),
        tag: s.tag || "",
        tagColor: s.tagColor || "",
        tagBorder: s.tagBorder || ""
      };
      data.id = ++this.msgCounter;
      this.lastTimestamp = data.timestamp;
      let dataStr = JSON.stringify(data);
      this.broadcast(dataStr);
      let key = new Date(data.timestamp).toISOString();
      await this.storage.put(key, dataStr);
    }
    await this.storage.put("scheduledMessages", this.scheduledMessages);
    if (this.scheduledMessages.length > 0) {
      let nextTime = Math.min(...this.scheduledMessages.map(s => s.time));
      await this.state.storage.setAlarm(nextTime);
    }
  }

  broadcast(message) {
    if (typeof message !== "string") {
      message = JSON.stringify(message);
    }

    let quitters = [];
    this.sessions.forEach((session, webSocket) => {
      if (session.name) {
        try {
          webSocket.send(message);
        } catch (err) {
          session.quit = true;
          quitters.push(session);
          this.sessions.delete(webSocket);
        }
      } else {
        session.blockedMessages.push(message);
      }
    });

    quitters.forEach(quitter => {
      if (quitter.name) {
        this.broadcast({quit: quitter.name});
      }
    });
  }
}
