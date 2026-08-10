// v1.57 拆分：ChatRoom 的 HTTP fetch() 端点全部搬移至此（原 chatroom.mjs 154-731 行）
// 范式：handleHttp(room, request) —— room 为 ChatRoom 类实例，通过 room.xxx 访问存储/广播/会话
// 依赖共享：SAFE_COLOR_RE / safeEqual / handleErrors 来自 utils.mjs，stripSensitiveMsg 来自 manage.mjs
import { handleErrors, safeEqual, SAFE_COLOR_RE } from "../utils.mjs";
import { stripSensitiveMsg } from "./manage.mjs";

export async function handleHttp(room, request) {
  return await handleErrors(request, async () => {
    if (room._loadBlacklist) await room._loadBlacklist;

    let url = new URL(request.url);

    if (!room.roomName) {
      room.roomName = url.searchParams.get("room_name");
    }

    switch (url.pathname) {
      case "/websocket": {
        if (request.headers.get("Upgrade") != "websocket") {
          return new Response("需要 WebSocket", {status: 400});
        }
        // 💥 房间已销毁：升级后立即以 destroyed 关闭（前端识别跳首页），避免 handleSession 异常 1011
        if (room._loadDestroyed) await room._loadDestroyed;
        if (room.destroyed) {
          let dPair = new WebSocketPair();
          dPair[1].accept();
          dPair[1].close(1000, "destroyed");
          return new Response(null, { status: 101, webSocket: dPair[0] });
        }
        let ip = request.headers.get("CF-Connecting-IP");
        // 检查房间密码
        if (room.roomName && room.env.registry) {
          try {
            let pwd = url.searchParams.get("password") || "";
            let registryId = room.env.registry.idFromName("global");
            let stub = room.env.registry.get(registryId);
            let pwdCheck = await stub.fetch("https://dummy-url/verify-password", {
              method: "POST",
              body: JSON.stringify({name: room.roomName, password: pwd}),
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
        await room.handleSession(pair[1], ip);
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      case "/clear-messages": {
        await room.clearAllMessages();
        return new Response("聊天记录已清空。", { status: 200 });
      }

      case "/blacklist/add": {
        let name = url.searchParams.get("name");
        if (!name) return new Response("请提供用户名", { status: 400 });
        room.blacklist.add(name);
        await room.storage.put("blacklist", [...room.blacklist]);
        return new Response(name + " 已被加入黑名单", { status: 200 });
      }

      case "/blacklist/remove": {
        let name = url.searchParams.get("name");
        if (!name) return new Response("请提供用户名", { status: 400 });
        room.blacklist.delete(name);
        await room.storage.put("blacklist", [...room.blacklist]);
        return new Response(name + " 已被移出黑名单", { status: 200 });
      }

      case "/blacklist/list": {
        return new Response(JSON.stringify([...room.blacklist]), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      }

      case "/users": {
        let users = [];
        for (let s of room.sessions.values()) {
          if (s.name) users.push(s.name);
          else users.push("? 未知#" + s.connId);
        }
        return new Response(JSON.stringify(users), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      }

      case "/users-detail": {
        let users = [];
        for (let s of room.sessions.values()) {
          if (s.name) users.push({name: s.name, ip: s.ip || ""});
          else users.push({name: "? 未知#" + s.connId, ip: s.ip || ""});
        }
        return new Response(JSON.stringify(users), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      }

      case "/stats": {
        // 📈 v1.54 运营数据：每日消息计数（只读，供 registry /ops/stats 遍历聚合；非公开端点，仅内部/管理转发可达）
        let msgByDay = {};
        let entries = await room.storage.list({ prefix: "stat:msg:" });
        for (let [k, v] of entries) {
          let d = k.slice("stat:msg:".length);
          if (d) msgByDay[d] = Number(v) || 0;
        }
        return new Response(JSON.stringify({ room: room.roomName, msgByDay }), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      }

      case "/files": {
        let channel = url.searchParams.get("channel") || "general"; // M11：不带频道默认只列/导 general
        let entries = await room.storage.list({reverse: true, limit: 100});
        let files = [];
        for (let [key, val] of entries) {
          try {
            let msg = JSON.parse(val);
            if (msg.type === "file" && (!channel || (msg.channel || "general") === channel)) {
              files.push({
                timestamp: msg.timestamp,
                name: msg.name,
                channel: msg.channel || "general",
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
        // 🔒 安全修复（L7）：非法时间戳直接返回 400，防 new Date(NaN).toISOString() 抛 500
        if (isNaN(parseInt(ts))) return new Response(JSON.stringify({error: "无效的时间戳"}), {status: 400, headers: {"Content-Type": "application/json"}});
        let key = new Date(parseInt(ts)).toISOString();
        let val = await room.storage.get(key);
        if (!val) return new Response("未找到文件", {status: 404});
        // 🔒 安全修复（v1.34）：文件公开端只给元数据——非 file 消息返回 404，并剔除 base64 正文与敏感字段
        let m;
        try { m = JSON.parse(val); } catch (e) { return new Response(JSON.stringify({error: "数据异常"}), {status: 500, headers: {"Content-Type": "application/json"}}); }
        if (!m || m.type !== "file") return new Response(JSON.stringify({error: "该消息不是文件"}), {status: 404, headers: {"Content-Type": "application/json"}});
        delete m.data;
        return new Response(JSON.stringify(stripSensitiveMsg(m)), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      }

      case "/messages": {
        let limit = parseInt(url.searchParams.get("limit")) || 50;
        if (limit > 200) limit = 200;
        let channel = url.searchParams.get("channel") || "general";
        let before = url.searchParams.get("before"); // 时间戳游标
        // 🔒 安全修复（W19）：非法时间戳直接忽略游标，防 new Date(NaN).toISOString() 抛 500
        if (before && isNaN(parseInt(before))) before = "";
        // 频道体系：读更大批次补偿其他频道消息穿插，按 channel 过滤到 limit
        let fetchLimit = Math.min(limit * 3, 1000);
        let entries;
        if (before) {
          let beforeKey = new Date(parseInt(before)).toISOString();
          entries = await room.storage.list({reverse: true, limit: fetchLimit, start: beforeKey});
        } else {
          entries = await room.storage.list({reverse: true, limit: fetchLimit});
        }
        let msgs = [];
        for (let [key, val] of entries) {
          // v1.56 知识库正文走 doc:<id> 分 key，不混入消息流
          if (key.startsWith("doc:")) continue;
          try {
            let msg = JSON.parse(val);
            if (msg.type !== "file" && (msg.channel || "general") === channel) {
              msgs.push({
                timestamp: msg.timestamp,
                name: msg.name,
                message: msg.message,
                type: msg.type,
                channel: msg.channel || "general",
                tag: msg.tag,
                tagColor: msg.tagColor,
                tagBorder: msg.tagBorder || "",
                color: msg.color,
                fileName: msg.fileName,
                fileSize: msg.fileSize,
                duration: msg.duration,
                fid: msg.fid,
                repo: msg.repo,
                id: msg.id,
                atAll: msg.atAll,
                avatar: msg.avatar,
                reply: msg.reply
              });
              if (msgs.length >= limit) break;
            }
          } catch (e) {}
        }
        msgs.reverse();
        return new Response(JSON.stringify(msgs), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      }

      case "/search": {
        // 🔍 历史搜索：服务端遍历最近消息，按关键词/用户名/频道过滤（无索引，遍历最近 2000 条）
        let q = url.searchParams.get("q") || "";
        let sName = url.searchParams.get("name") || "";
        let sChannel = url.searchParams.get("channel") || "general"; // M11：不带频道默认只搜 general，防跨频道泄露
        let limit = parseInt(url.searchParams.get("limit")) || 30;
        if (limit > 100) limit = 100;
        if (!q.trim()) return new Response(JSON.stringify({error: "缺少搜索关键词"}), {status: 400, headers: {"Content-Type": "application/json"}});
        let qLower = q.trim().toLowerCase();
        let entries = await room.storage.list({reverse: true, limit: 2000});
        let results = [];
        for (let [key, val] of entries) {
          if (results.length >= limit) break;
          try {
            let msg = JSON.parse(val);
            if (!msg || typeof msg.message !== "string") continue;
            if (msg.type === "file" || msg.type === "image" || msg.type === "zifu" || msg.type === "recalled" || msg.type === "deleted") continue;
            if (sChannel && (msg.channel || "general") !== sChannel) continue;
            if (sName && msg.name !== sName) continue;
            if (msg.message.toLowerCase().includes(qLower)) {
              results.push({
                timestamp: msg.timestamp, name: msg.name, message: msg.message,
                type: msg.type, channel: msg.channel || "general",
                tag: msg.tag, tagColor: msg.tagColor, tagBorder: msg.tagBorder || "",
                color: msg.color, id: msg.id, reply: msg.reply, atAll: msg.atAll, avatar: msg.avatar
              });
            }
          } catch (e) {}
        }
        results.reverse();
        return new Response(JSON.stringify(results), {status: 200, headers: {"Content-Type": "application/json"}});
      }

      case "/export": {
        let format = url.searchParams.get("format") || "json";
        let channel = url.searchParams.get("channel") || "general"; // M11：不带频道默认只列/导 general
        let entries = await room.storage.list({reverse: false});
        let msgs = [];
        for (let [key, val] of entries) {
          // v1.56 知识库正文走 doc:<id> 分 key，不混入导出
          if (key.startsWith("doc:")) continue;
          try {
            let msg = JSON.parse(val);
            if (msg && (msg.type === undefined || msg.type === "text" || msg.type === "image" || msg.type === "file" || msg.type === "zifu" || msg.type === "voice" || msg.type === "gh-card") && (!channel || (msg.channel || "general") === channel)) {
              // 🔒 安全修复（F7）：导出日志剔除匿名身份指纹字段，防真实身份经 export 泄漏
              delete msg._anonOwner;
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
            "Content-Disposition": "attachment; filename=chatlog_" + (room.roomName || "export") + ".txt"
          }});
        } else {
          return new Response(JSON.stringify(msgs, null, 2), {status: 200, headers: {
            "Content-Type": "application/json;charset=utf-8",
            "Content-Disposition": "attachment; filename=chatlog_" + (room.roomName || "export") + ".json"
          }});
        }
      }

      case "/broadcast-message": {
        let text = url.searchParams.get("text");
        if (!text) return new Response("请提供消息内容", {status: 400});
        // 🔒 安全修复（F4）：webhook 广播同样过敏感词过滤，防绕过 WebSocket 文本路径的敏感词审查
        if (room.containsProfanity(text)) {
          return new Response("消息包含违规内容，已拦截", {status: 403});
        }
        // 🔒 安全修复（F3）：sender 固定为 "Webhook"，忽略请求体提供的 sender 字段（防冒充任意用户/管理员昵称）
        let sender = "Webhook";
        // 🔗 通用 Webhook 增强：可选 channel 参数（合法且存在的频道才生效，否则 general）+ webhook 来源标记
        let channelParam = url.searchParams.get("channel") || "";
        let isWebhook = url.searchParams.get("webhook") === "1";
        let targetChannel = "general";
        if (channelParam) {
          if (room._loadChannels) await room._loadChannels;
          if (/^[a-zA-Z0-9_-]{1,24}$/.test(channelParam) && room.channels.some(c => c.name === channelParam)) {
            targetChannel = channelParam;
          }
        }

        let timestamp = Date.now();
        let data = {
          type: "text",
          message: text,
          name: sender,
          timestamp: Math.max(timestamp, room.lastTimestamp + 1),
          tag: "📢",
          tagColor: "red",
          tagBorder: "",
          // 🔒 安全修复（F3）：移除 admin 标记——sender 已固定为 "Webhook"，保留 admin:true 会渲染出"管理员"身份误导；
          // roomwide 如实描述广播范围，予以保留
          channel: targetChannel,
          roomwide: true
        };
        if (isWebhook) data.webhook = true;
        data.id = ++room.msgCounter;
        room.lastTimestamp = data.timestamp;
        let dataStr = JSON.stringify(data);
        if (channelParam) {
          room.broadcastToChannel(targetChannel, dataStr);
        } else {
          room.broadcast(dataStr);
        }
        let key = new Date(data.timestamp).toISOString();
        await room.storage.put(key, dataStr);
        // 📈 v1.54 运营数据：每日消息计数日桶（广播/webhook 消息同样计入）
        await room.bumpMsgStat(data.timestamp);
        return new Response("消息已发送到房间 " + (room.roomName || "未知"), {status: 200});
      }

      case "/do-kick": {
        let targetName = url.searchParams.get("name");
        let callerName = url.searchParams.get("caller") || "";
        if (!targetName) return new Response("请提供用户名", {status: 400});
        if (targetName === callerName) {
          return new Response("不能踢出自己", {status: 400});
        }
        // 🧪 v1.49 LP：caller 存在 = 用户主动踢人（聊天室内 /kick 命令 / roster 踢出按钮经 admin API 转发）。
        //   chat.admin.kickUser 显式 false 硬拦（即使管理员/超管），未定义(null) 放行（管理 API 已做 admin 鉴权）。
        //   （管理后台踢人/全局踢/改标签踢人都不带 caller，走运维通道，不受此限）
        if (callerName) {
          let lpOk = await room.lpRawPerm(callerName, "chat.admin.kickUser");
          if (lpOk === false) return new Response("你无权执行该操作", {status: 403});
        }

        // 检查VIP踢出保护（全局机制，管理员也不能绕过）
        for (let [ws, s] of room.sessions) {
          if (s.name === targetName && s.vip && s.vip.features && s.vip.features.kickProtect) {
            return new Response("受保护，无法踢出", {status: 403});
          }
        }
        // 检查全局踢出保护名单
        if (room.env.registry) {
          try {
            let registryId = room.env.registry.idFromName("global");
            let stub = room.env.registry.get(registryId);
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
          for (let [ws, s] of room.sessions) {
            if (s.connId === targetConnId && !s.name) {
              kickedWs = ws;
              break;
            }
          }
        } else {
          for (let [ws, s] of room.sessions) {
            if (s.name === targetName) {
              kickedWs = ws;
              break;
            }
          }
        }

        if (kickedWs) {
          room.sessions.delete(kickedWs);
          kickedWs.close(1000, "kicked");
          room.broadcast({kicked: targetName});
          await room.updateRegistry();
          return new Response("已踢出 " + targetName, {status: 200});
        }
        return new Response("未找到用户 " + targetName, {status: 404});
      }

      case "/do-clear": {
        await room.clearAllMessages();
        return new Response("聊天记录已清空。", { status: 200 });
      }

      case "/do-kick-all": {
        // v1.40 运维：踢出本房间全部在线用户（不销毁房间/不清消息），供 admin 全局清场
        // v1.42 /kickall 命令：支持 ?except=用户名 排除触发者自己（房间清场但自己留下）
        // 🔒 v1.42 管理专用：校验管理密钥（ADMIN_KEY 或 super），防止绕过前端直接调用端点踢人
        let k = url.searchParams.get("key") || "";
        let isKeyOk = (room.env.ADMIN_KEY && safeEqual(k, room.env.ADMIN_KEY)) || (room.env.ADMIN_SECRET_KEY && safeEqual(k, room.env.ADMIN_SECRET_KEY));
        if (!isKeyOk) return new Response("未经授权", { status: 401 });
        let except = url.searchParams.get("except") || "";
        // 🧪 v1.49 LP：/kickall 触发者(except) 的 chat.admin.kickUser 显式 false 同样硬拦
        if (except) {
          let lpOk = await room.lpRawPerm(except, "chat.admin.kickUser");
          if (lpOk === false) return new Response("你无权执行该操作", {status: 403});
        }
        let count = 0;
        for (let [webSocket, session] of room.sessions) {
          if (except && session.name === except) continue;
          try { webSocket.close(1000, "kicked"); } catch (e) {}
          count++;
        }
        for (let [webSocket, session] of room.sessions) {
          if (except && session.name === except) continue;
          room.sessions.delete(webSocket);
        }
        await room.updateRegistry();
        return new Response("已踢出 " + count + " 人", { status: 200 });
      }

      case "/do-destroy": {
        // 一键销毁房间：清空消息、断开所有连接
        room.destroyed = true;
        try { await room.storage.put("__destroyed__", "1"); } catch (e) {}
        await room.clearAllMessages();
        room.sessions.forEach((session, webSocket) => {
          try { webSocket.close(1000, "destroyed"); } catch (e) {}
        });
        room.sessions.clear();
        // registry 删除由管理 API 层直接处理
        return new Response("房间 " + (room.roomName || "未知") + " 已销毁", { status: 200 });
      }

      case "/message/recall": {
        let recallTs = url.searchParams.get("timestamp");
        let recallName = url.searchParams.get("name");
        if (!recallTs || !recallName) return new Response("缺少参数", {status: 400});
        // 🔒 安全修复（L7）：非法时间戳直接返回 400，防 new Date(NaN).toISOString() 抛 500
        if (isNaN(parseInt(recallTs))) return new Response(JSON.stringify({error: "无效的时间戳"}), {status: 400, headers: {"Content-Type": "application/json"}});
        let recallKey = new Date(parseInt(recallTs)).toISOString();
        let recallOrig = await room.storage.get(recallKey);
        // 🔒 安全修复（LD19）：消息不存在直接拒绝，杜绝伪造"已撤回"篡改视图 + 任意 storage key 写入
        if (!recallOrig) return new Response("消息不存在或已过期，无法撤回", {status: 400});
        let origData;
        try { origData = JSON.parse(recallOrig); } catch (e) { return new Response("消息不存在或已过期，无法撤回", {status: 400}); }
        if (origData.name !== recallName) {
          return new Response("无权撤回他人的消息", {status: 403});
        }
        let now = Date.now();
        if (now - parseInt(recallTs) > 120000) {
          return new Response("超过2分钟无法撤回", {status: 400});
        }
        let recalledMsg = JSON.stringify({type: "recalled", name: recallName, timestamp: parseInt(recallTs), channel: origData.channel || "general"});
        await room.storage.put(recallKey, recalledMsg);
        room.broadcast(recalledMsg);
        return new Response("ok", {status: 200});
      }

      case "/tag-update": {
        let targetName = url.searchParams.get("name");
        let newTag = url.searchParams.get("tag") || "";
        let newColor = url.searchParams.get("color") || "";
        let newBorder = url.searchParams.get("border") || "";
        if (!targetName) return new Response("请提供用户名", {status: 400});

        // 🔒 安全修复（LD9）：tag-update 只更新"已认证"的同名会话，防游客陈旧会话被改标签获得管理权限
        for (let [ws, s] of room.sessions) {
          if (s.name === targetName && s.authenticated) {
            s.tag = newTag;
            s.tagColor = newColor;
            s.tagBorder = newBorder;
          }
        }

        room.broadcast({type: "tag-update", name: targetName, tag: newTag, tagColor: newColor, tagBorder: newBorder});
        return new Response("ok", {status: 200});
      }

      case "/set-announcement": {
        let annText = url.searchParams.get("text") || "";
        room.announcement = annText;
        await room.storage.put("announcement", annText);
        room.broadcast({type: "announcement", text: annText});
        return new Response("公告已" + (annText ? "更新" : "清除"), {status: 200});
      }

      case "/get-announcement": {
        return new Response(JSON.stringify({text: room.announcement || ""}), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      }

      // 🏅 房间等级样式：设置/更新某等级徽章样式（颜色白名单 + 图标/文字限长拒 HTML）
      case "/set-level-styles": {
        let level = parseInt(url.searchParams.get("level"), 10);
        let color = url.searchParams.get("color") || "";
        let icon = url.searchParams.get("icon") || "";
        let text = url.searchParams.get("text") || "";
        if (!(level >= 1 && level <= 999)) return new Response("等级无效", {status: 400});
        // 防护：颜色过白名单（非法置空）；图标 ≤4 字符、文字 ≤10 字符且拒 HTML 特殊字符
        if (color && !SAFE_COLOR_RE.test(String(color))) color = "";
        if (icon.length > 4 || /[<>&"']/.test(icon)) icon = "";
        if (text.length > 10 || /[<>&"']/.test(text)) text = "";
        if (!room.levelStyles || typeof room.levelStyles !== "object") room.levelStyles = {};
        if (color || icon || text) {
          room.levelStyles[String(level)] = {color, icon, text};
        } else {
          delete room.levelStyles[String(level)]; // 三项全空视为清除该等级样式
        }
        await room.storage.put("levelStyles", room.levelStyles);
        room.broadcast({type: "level-styles", styles: room.levelStyles});
        return new Response("等级样式已更新", {status: 200});
      }

      // 🏅 房间等级样式：清除单个等级样式
      case "/clear-level-style": {
        let level = parseInt(url.searchParams.get("level"), 10);
        if (!(level >= 1 && level <= 999)) return new Response("等级无效", {status: 400});
        if (room.levelStyles && typeof room.levelStyles === "object") {
          delete room.levelStyles[String(level)];
          await room.storage.put("levelStyles", room.levelStyles);
          room.broadcast({type: "level-styles", styles: room.levelStyles});
        }
        return new Response("等级样式已清除", {status: 200});
      }

      // 📌 置顶消息（v1.35）：按频道设置置顶（从 storage 读原消息构造快照，channel 须存在于频道列表）
      case "/set-pinned": {
        let pinChannel = "" + (url.searchParams.get("channel") || "general");
        let pinTs = parseInt(url.searchParams.get("timestamp"), 10);
        if (!pinTs) return new Response("请提供消息时间戳", {status: 400});
        if (room._loadChannels) await room._loadChannels;
        if (!room.channels || !room.channels.some(c => c.name === pinChannel)) {
          return new Response("频道不存在", {status: 400});
        }
        try {
          let raw = await room.storage.get(new Date(pinTs).toISOString());
          if (!raw) return new Response("消息不存在", {status: 404});
          let m = JSON.parse(raw);
          if ((m.channel || "general") !== pinChannel) return new Response("消息不属于该频道", {status: 400});
          if (m.type === "deleted" || m.type === "recalled") return new Response("消息已删除或撤回", {status: 400});
          let safe = stripSensitiveMsg(m);
          let pinObj = {
            name: safe.name || "未知",
            text: safe.message !== undefined ? safe.message : (safe.text || ""),
            timestamp: pinTs,
            tag: safe.tag || "", tagColor: safe.tagColor || "", tagBorder: safe.tagBorder || "",
            channel: pinChannel, pinnedBy: "admin", pinnedAt: Date.now()
          };
          await room.addPinnedMessage(pinChannel, pinObj);
          return new Response("已置顶", {status: 200});
        } catch (e) {
          return new Response("消息读取失败", {status: 500});
        }
      }

      // 📌 置顶消息（v1.35）：按频道+时间戳取消置顶
      case "/clear-pinned": {
        let pinChannel = "" + (url.searchParams.get("channel") || "general");
        let pinTs = parseInt(url.searchParams.get("timestamp"), 10);
        if (!pinTs) return new Response("请提供消息时间戳", {status: 400});
        await room.removePinnedMessage(pinChannel, pinTs);
        return new Response("已取消置顶", {status: 200});
      }

      case "/get-pinned": {
        if (room._loadPinnedMessages) await room._loadPinnedMessages;
        return new Response(JSON.stringify({pinned: room.pinnedMessages || {}}), {
          status: 200, headers: {"Content-Type": "application/json"}
        });
      }

      default:
        return new Response("未找到", {status: 404});
    }
  });
}
